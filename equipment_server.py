#!/usr/bin/env python3
"""Local read-only server for the equipment created-at report."""

import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path

import pymysql
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
HTML_PATH = BASE_DIR / "index.html"
JS_PATH = BASE_DIR / "equipment_report.js"
LEGACY_HTML_PATH = BASE_DIR / "equipment_report.html"

HOST = os.environ["MYSQL_HOST"]
PORT = int(os.environ.get("MYSQL_PORT", "3306"))
DB = os.environ["MYSQL_DATABASE"]
USER = os.environ["MYSQL_USER"]
PASSWORD = os.environ["MYSQL_PASSWORD"]

EQUIPMENT_SQL = """
SELECT
  e.id AS equipment_id,
  e.alias, e.type, e.classification, e.plate, e.model,
  eman.display_name AS manufacturer,
  e.serial_number, e.manufacture_year, e.ownership,
  c.name AS company_name, e.company_id,
  FROM_UNIXTIME(e.created_at) AS created_at,
  cl.user_id AS creator_user_id,
  TRIM(CONCAT(COALESCE(u.forename,''),' ',COALESCE(u.surname,''))) AS creator_name,
  u.email AS creator_email, u.username AS creator_username,
  dn.code AS last_paired_device,
  TRIM(CONCAT(COALESCE(pu.forename,''),' ',COALESCE(pu.surname,''))) AS paired_by_name,
  pu.email AS paired_by_email,
  FROM_UNIXTIME(ei.time_from) AS paired_at,
  dn.part_number,
  pi.part_display_ns AS part_name
FROM fieldin.equipment e
LEFT JOIN fieldin.companies c ON c.id = e.company_id
LEFT JOIN fieldin.equipment_manufacturers eman ON eman.id = e.manufacturer_id
LEFT JOIN (
  SELECT ei2.equipment_id, ei2.device_id, ei2.user_id, ei2.time_from
  FROM fieldin.equipment_installations ei2
  INNER JOIN (
    SELECT equipment_id, MAX(time_from) AS max_tf
    FROM fieldin.equipment_installations
    GROUP BY equipment_id
  ) latest ON latest.equipment_id = ei2.equipment_id AND latest.max_tf = ei2.time_from
) ei ON ei.equipment_id = e.id
LEFT JOIN fieldin.devices_new dn ON dn.id = ei.device_id
LEFT JOIN fieldin.users pu ON pu.id = ei.user_id
LEFT JOIN (
  SELECT el.equipment_id, el.user_id
  FROM fieldin.equipment_logs el
  INNER JOIN (
    SELECT equipment_id, MIN(id) AS min_id
    FROM fieldin.equipment_logs
    WHERE JSON_CONTAINS_PATH(`change`, 'one', '$.inserted')
    GROUP BY equipment_id
  ) f ON f.equipment_id = el.equipment_id AND f.min_id = el.id
) cl ON cl.equipment_id = e.id
LEFT JOIN fieldin.users u ON u.id = cl.user_id
LEFT JOIN fieldin.parts_inventory pi ON pi.part_name_ns = dn.part_number
WHERE e.created_at >= UNIX_TIMESTAMP(%s)
  AND e.created_at <= UNIX_TIMESTAMP(%s)
  AND (e.deleted_at IS NULL OR e.deleted_at = 0)
ORDER BY e.created_at DESC
"""

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

app = Flask(__name__)


def default_range():
    today = date.today()
    start = today - timedelta(days=3)
    return start.isoformat(), today.isoformat()


def parse_range(from_s, to_s):
    if not from_s or not to_s:
        from_s, to_s = default_range()
    if not DATE_RE.match(from_s) or not DATE_RE.match(to_s):
        raise ValueError("Dates must be YYYY-MM-DD")
    if from_s > to_s:
        raise ValueError("'from' must be on or before 'to'")
    start_dt = f"{from_s} 00:00:00"
    end_dt = f"{to_s} 23:59:59"
    return start_dt, end_dt, from_s, to_s


def dash(val):
    if val is None:
        return "—"
    s = str(val).strip()
    return s if s else "—"


def fmt_dt(val, utc_suffix=False):
    if val is None:
        return "—", ""
    if isinstance(val, datetime):
        s = val.strftime("%Y-%m-%d %H:%M:%S")
    else:
        s = str(val).strip()
        if not s:
            return "—", ""
        if len(s) >= 19:
            s = s[:19]
    if utc_suffix and s != "—":
        return s + " UTC", s + " UTC"
    return s, s


def row_to_json(row):
    created_at, created_at_ts = fmt_dt(row.get("created_at"))
    paired_at, paired_at_ts = fmt_dt(row.get("paired_at"), utc_suffix=True)
    creator_name = dash(row.get("creator_name"))
    if creator_name == "—" and row.get("creator_user_id") is None:
        creator_name = "—"
    elif creator_name == "—":
        creator_name = "—"

    return {
        "equipment_id": str(row["equipment_id"]),
        "alias": dash(row.get("alias")),
        "type": dash(row.get("type")),
        "classification": dash(row.get("classification")),
        "plate": dash(row.get("plate")),
        "model": dash(row.get("model")),
        "manufacturer": dash(row.get("manufacturer")),
        "serial_number": dash(row.get("serial_number")),
        "manufacture_year": dash(row.get("manufacture_year")),
        "ownership": dash(row.get("ownership")),
        "company_name": dash(row.get("company_name")),
        "company_id": str(row["company_id"]) if row.get("company_id") is not None else "—",
        "created_at": created_at,
        "created_at_ts": created_at_ts,
        "creator_name": creator_name,
        "creator_email": dash(row.get("creator_email")),
        "creator_username": dash(row.get("creator_username")),
        "last_paired_device": dash(row.get("last_paired_device")),
        "paired_by_name": dash(row.get("paired_by_name")),
        "paired_by_email": dash(row.get("paired_by_email")),
        "paired_at": paired_at,
        "paired_at_ts": paired_at_ts if paired_at_ts else "",
        "part_number": dash(row.get("part_number")),
        "part_name": dash(row.get("part_name")),
    }


def fetch_equipment(from_date, to_date):
    start_dt, end_dt, from_s, to_s = parse_range(from_date, to_date)
    conn = pymysql.connect(
        host=HOST,
        port=PORT,
        user=USER,
        password=PASSWORD,
        database=DB,
        connect_timeout=8,
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SET SESSION TRANSACTION READ ONLY")
            cur.execute(EQUIPMENT_SQL, (start_dt, end_dt))
            rows = cur.fetchall()
    finally:
        conn.close()
    return [row_to_json(r) for r in rows], from_s, to_s


@app.after_request
def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/api/equipment", methods=["OPTIONS"])
def api_equipment_options():
    return "", 204


@app.get("/")
def index():
    return send_file(HTML_PATH, mimetype="text/html")


@app.get("/equipment_report.html")
def legacy_html():
    path = LEGACY_HTML_PATH if LEGACY_HTML_PATH.is_file() else HTML_PATH
    return send_file(path, mimetype="text/html")


@app.get("/equipment_report.js")
@app.get("/report.js")
def report_js():
    return send_file(JS_PATH, mimetype="application/javascript")


@app.get("/api/equipment")
def api_equipment():
    from_date = request.args.get("from", "")
    to_date = request.args.get("to", "")
    try:
        data, from_s, to_s = fetch_equipment(from_date, to_date)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except pymysql.Error as exc:
        return jsonify({"error": f"Database error: {exc}"}), 500
    return jsonify({
        "from": from_s,
        "to": to_s,
        "count": len(data),
        "rows": data,
    })


if __name__ == "__main__":
    flask_host = os.environ.get("FLASK_HOST", "127.0.0.1")
    flask_port = int(os.environ.get("FLASK_PORT", "5555"))
    app.run(host=flask_host, port=flask_port, debug=False)
