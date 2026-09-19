#!/usr/bin/env bash
# Detach-safe wrapper: start once, then poll state/ from any short-lived shell.
#   start  -> launches the matrix under setsid+flock, returns immediately
#   status -> prints current state and exits 0 (running) / 1 (failed) / 0 (done)
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RUN_DIR=${RUN_DIR:-"${TMPDIR:-/tmp}/super-explorer-matrix"}
STATE="${STATE_DIR:-$RUN_DIR/state}"
LOCK="$STATE/matrix.lock"

mkdir -p "$STATE"

case "${1:-status}" in
start)
  # flock makes a second start a no-op instead of an overlapping Ollama run.
  LOG_DIR="$RUN_DIR" setsid nohup flock -n "$LOCK" "$ROOT/scripts/run-super-explorer-matrix.sh" \
    >"$STATE/supervisor.log" 2>&1 &
  echo "started pid $!"
  ;;
status)
  if pgrep -f run-super-explorer-matrix.sh >/dev/null; then
    echo "RUNNING"
  else
    echo "NOT RUNNING"
  fi
  tail -n 3 "$STATE/supervisor.log" 2>/dev/null || true
  ls -l --time-style=+%H:%M:%S "$(dirname "$STATE")"/*.log 2>/dev/null || true
  ;;
*)
  echo "usage: $0 {start|status}" >&2
  exit 2
  ;;
esac
