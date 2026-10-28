#!/usr/bin/env bash
# the verification ladder. one command per rung, and each rung says what it proves.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rung="${1:-l0}"

worker() {
  (cd "$root/apps/worker" && ./node_modules/.bin/vitest run "$@")
}

case "$rung" in
  l0)
    echo "L0 unit and contract tests"
    (cd "$root/apps/worker" && ./node_modules/.bin/tsc --noEmit)
    worker
    (cd "$root/apps/desktop" && ./node_modules/.bin/tsc --noEmit)
    (cd "$root/apps/web" && ./node_modules/.bin/tsc --noEmit)
    echo "L0 passed: types and unit contracts hold"
    ;;
  l1)
    echo "L1 local stack"
    echo "requires: wrangler dev on 8787 with a local d1"
    "$root/tools/verify-l1.mjs"
    ;;
  l2)
    echo "L2 web ui"
    echo "requires: the local worker on 8787"
    if [ ! -f "$root/apps/web/vitest.e2e.config.ts" ]; then
      echo "L2 not configured: apps/web/vitest.e2e.config.ts is missing" >&2
      exit 1
    fi
    (cd "$root/apps/web" && ./node_modules/.bin/vitest run --config vitest.e2e.config.ts)
    ;;
  l3)
    echo "L3 desktop"
    echo "requires: a linux desktop with webkit2gtk, xvfb, and a local worker"
    if ! command -v cargo >/dev/null 2>&1; then
      echo "L3 not runnable here: no cargo in PATH" >&2
      exit 1
    fi
    (cd "$root/apps/desktop" && cargo build --manifest-path src-tauri/Cargo.toml)
    "$root/tools/verify-desktop.sh"
    ;;
  l4)
    echo "L4 ci"
    echo "runs on github: .github/workflows/worker.yml and desktop.yml"
    ;;
  gates)
    echo "the pilot checklist, gate by gate"
    "$root/tools/verify-gates.mjs"
    ;;
  l5)
    echo "L5 live probes"
    "$root/tools/verify-live.sh"
    ;;
  all)
    for step in l0 l1 gates; do "$0" "$step"; done
    ;;
  *)
    echo "unknown rung: $rung (l0 l1 l2 l3 l4 l5 gates all)" >&2
    exit 2
    ;;
esac
