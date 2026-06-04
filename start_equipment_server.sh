#!/bin/bash
# Start the equipment report server (default port 5555)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example to .env and set MySQL credentials."
  exit 1
fi

PORT="${FLASK_PORT:-5555}"
if lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "Port $PORT already in use. Stop with: kill \$(lsof -t -i :$PORT)"
  exit 1
fi

nohup python3 "$ROOT/equipment_server.py" >> "$ROOT/equipment_server.log" 2>&1 &
echo "Started equipment server PID $! — http://127.0.0.1:${PORT}/"
