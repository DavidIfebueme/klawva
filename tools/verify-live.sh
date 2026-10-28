#!/usr/bin/env bash
# L5: post-deploy probes. read-only, safe to run any time.
set -euo pipefail
base="${KLAWVA_LIVE_URL:-https://klawva.xyz}"

probe() {
  local path="$1" expect="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "$base$path")"
  if [ "$code" = "$expect" ]; then
    echo "  ok   $path -> $code"
  else
    echo "  FAIL $path -> $code (expected $expect)"
    exit 1
  fi
}

echo "L5 live probes against $base"
probe /health 200
probe /api/listings 200
probe /api/devices/claim 404
probe /api/voice/twiml 200
echo "L5 passed"
