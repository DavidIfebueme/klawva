#!/usr/bin/env bash
# L3: pairing against a local worker, no gui automation needed.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${KLAWVA_WORKER_URL:=http://127.0.0.1:8787}"
if ! curl -fsS "$KLAWVA_WORKER_URL/health" >/dev/null 2>&1; then
  echo "L3 needs a worker at $KLAWVA_WORKER_URL" >&2
  exit 1
fi
if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "L3 needs xvfb-run for the app window" >&2
  exit 1
fi
cd "$root/apps/desktop"
xvfb-run -a ./src-tauri/target/debug/klawva-desktop --verify
