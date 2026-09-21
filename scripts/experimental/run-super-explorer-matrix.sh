#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
MODEL=${MODEL:-qwen3.5:4b}
CASES=(SE-01 SE-03)
LOG_DIR=${LOG_DIR:-"${TMPDIR:-/tmp}/super-explorer-matrix"}

mkdir -p "$LOG_DIR"

run_one() {
  local limit=$1
  local think=$2
  local tag="limit${limit}-think${think}"
  local log="$LOG_DIR/${tag}.log"

  if pgrep -f "gold-set-cli.ts" >/dev/null; then
    echo "A prior gold-set process is still running; aborting $tag." >&2
    pgrep -af "gold-set-cli.ts" >&2
    return 1
  fi

  echo "=== starting $tag ==="
  if npm run gold-set:super-explorer -- "$ROOT" "$MODEL" "${CASES[@]}" --limit="$limit" --think="$think" >"$log" 2>&1; then
    echo "=== finished $tag ==="
  else
    local status=$?
    echo "=== failed $tag (exit $status); see $log ===" >&2
    return "$status"
  fi

  if pgrep -f "gold-set-cli.ts" >/dev/null; then
    echo "A gold-set process survived $tag; aborting before the next setting." >&2
    pgrep -af "gold-set-cli.ts" >&2
    return 1
  fi

  sleep 20
}

run_one 80 false
run_one 80 true
run_one 100 false
run_one 100 true

echo "All runs complete. Logs: $LOG_DIR"
