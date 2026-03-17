#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export VITE_DEMO_MODE="${VITE_DEMO_MODE:-false}"
export VITE_USE_FIREBASE_EMULATORS="${VITE_USE_FIREBASE_EMULATORS:-true}"
export VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID:-entrepreneurship-nexus-local}"
export VITE_FIREBASE_EMULATOR_HOST="${VITE_FIREBASE_EMULATOR_HOST:-127.0.0.1}"
export VITE_AUTH_EMULATOR_PORT="${VITE_AUTH_EMULATOR_PORT:-59099}"
export VITE_FIRESTORE_EMULATOR_PORT="${VITE_FIRESTORE_EMULATOR_PORT:-58080}"
export VITE_FUNCTIONS_EMULATOR_PORT="${VITE_FUNCTIONS_EMULATOR_PORT:-55001}"
export VITE_STORAGE_EMULATOR_PORT="${VITE_STORAGE_EMULATOR_PORT:-59199}"
export VITE_DEV_SERVER_HOST="${VITE_DEV_SERVER_HOST:-0.0.0.0}"
export VITE_DEV_SERVER_PORT="${VITE_DEV_SERVER_PORT:-3000}"

export FIREBASE_PROJECT_ID="$VITE_FIREBASE_PROJECT_ID"
export FIREBASE_FUNCTIONS_BASE_URL="http://${VITE_FIREBASE_EMULATOR_HOST}:${VITE_FUNCTIONS_EMULATOR_PORT}/${VITE_FIREBASE_PROJECT_ID}/us-central1"

EMULATOR_PID=""

cleanup() {
  if [[ -n "$EMULATOR_PID" ]] && kill -0 "$EMULATOR_PID" >/dev/null 2>&1; then
    kill "$EMULATOR_PID" >/dev/null 2>&1 || true
    wait "$EMULATOR_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

is_port_open() {
  local host="$1"
  local port="$2"
  python - "$host" "$port" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
s = socket.socket()
s.settimeout(0.5)
try:
    s.connect((host, port))
except OSError:
    sys.exit(1)
else:
    sys.exit(0)
finally:
    s.close()
PY
}

emulators_ready() {
  is_port_open "$VITE_FIREBASE_EMULATOR_HOST" "$VITE_AUTH_EMULATOR_PORT" &&
  is_port_open "$VITE_FIREBASE_EMULATOR_HOST" "$VITE_FIRESTORE_EMULATOR_PORT" &&
  is_port_open "$VITE_FIREBASE_EMULATOR_HOST" "$VITE_FUNCTIONS_EMULATOR_PORT" &&
  is_port_open "$VITE_FIREBASE_EMULATOR_HOST" "$VITE_STORAGE_EMULATOR_PORT"
}

run_with_retry() {
  local label="$1"
  local attempts="$2"
  shift 2

  local attempt=1
  while (( attempt <= attempts )); do
    if "$@"; then
      return 0
    fi
    if (( attempt == attempts )); then
      echo "${label} failed after ${attempts} attempts."
      return 1
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
}

if emulators_ready; then
  echo "Using existing Firebase emulators."
else
  echo "Starting Firebase emulators..."
  npm run firebase:emulators > /tmp/entrepreneurship-nexus-emulators.log 2>&1 &
  EMULATOR_PID=$!

  for _ in $(seq 1 60); do
    if emulators_ready; then
      break
    fi
    sleep 1
  done

  if ! emulators_ready; then
    echo "Firebase emulators did not become ready. Check /tmp/entrepreneurship-nexus-emulators.log"
    exit 1
  fi
fi

echo "Seeding local reference data..."
run_with_retry "Seeding local reference data" 20 npm run simulate:seed-local

echo "Creating local test accounts..."
run_with_retry "Creating local test accounts" 10 npm run simulate:seed-test-accounts

cat <<'EOF'

Local test logins:
  URL: http://${VITE_DEV_SERVER_HOST}:${VITE_DEV_SERVER_PORT}/
  Platform Admin: coach@makehaven.org
  Ecosystem Manager: ecosystem.admin@newhaven.example.org
  ESO Admin: eso.admin@makehaven.org
  ESO Staff: eso.staff@makehaven.org
  ESO Coach: eso.coach@makehaven.org
  Partner ESO Admin: eso.admin@ctinnovations.org
  Recipient ESO Admin: eso.admin@sbdc.org
  Recipient ESO Staff: advisor@sbdc.org
  Entrepreneur: founder@darkstarmarine.com
  Password: Password123!

EOF

exec npm run dev -- --host "$VITE_DEV_SERVER_HOST" --port "$VITE_DEV_SERVER_PORT"
