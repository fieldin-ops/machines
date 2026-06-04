# Equipment Report

A small local tool for ops and data teams: browse equipment created in a date range, with creator info, last device pairing, and part metadata. It runs a Flask server that serves a static HTML/JS UI and queries a **read-only** MySQL replica.

## What it shows

For each equipment row created in the selected range:

- Equipment identity (alias, type, classification, plate, model, serial, etc.)
- Company and ownership
- Created timestamp and creator (from first `equipment_logs` insert)
- Last paired device, who paired it, and when (from `equipment_installations`)
- Part number and display name (from `devices_new` / `parts_inventory`)

## Requirements

- Python 3.9+
- Network access to the Fieldin MySQL read replica
- Database credentials with read-only access

## Setup

```bash
cd equipment-report
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with real MYSQL_* values (never commit .env)
```

## Run

**Foreground (recommended for first try):**

```bash
source .venv/bin/activate
python3 equipment_server.py
```

Open [http://127.0.0.1:5555/](http://127.0.0.1:5555/) (or the host/port from `FLASK_HOST` / `FLASK_PORT` in `.env`).

**Background:**

```bash
chmod +x start_equipment_server.sh
./start_equipment_server.sh
```

Logs go to `equipment_server.log` in the project directory.

## Configuration

| Variable | Description |
|----------|-------------|
| `MYSQL_HOST` | Replica hostname |
| `MYSQL_PORT` | Port (default `3306`) |
| `MYSQL_DATABASE` | Database name (e.g. `fieldin`) |
| `MYSQL_USER` | Read-only user |
| `MYSQL_PASSWORD` | Password |
| `FLASK_HOST` | Bind address (default `127.0.0.1`) |
| `FLASK_PORT` | Port (default `5555`) |

## API

`GET /api/equipment?from=YYYY-MM-DD&to=YYYY-MM-DD` — JSON list of equipment rows for the inclusive created-at range.

## Security

- Credentials live only in `.env` (gitignored).
- The server uses `SET SESSION TRANSACTION READ ONLY` on each query.
- Bind to `127.0.0.1` unless you intentionally expose it on a trusted network.
