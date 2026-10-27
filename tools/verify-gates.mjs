#!/usr/bin/env node
// maps the pilot checklist gates to the checks this machine can actually run,
// and refuses to mark a gate green when it needs hardware or a psp sandbox.
import { execSync } from "node:child_process";

const run = (command) => {
  try {
    execSync(command, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

const covered = (label, command) => ({
  label,
  status: run(command) ? "pass" : "FAIL",
});

const manual = (label, why) => ({ label, status: "manual", why });

const gates = {
  "0a transport and versioning": [
    covered("L0 types and unit contracts", "cd apps/worker && ./node_modules/.bin/tsc --noEmit"),
    covered("worker suite", "cd apps/worker && ./node_modules/.bin/vitest run"),
    manual("live bind on a real device", "needs a paired device against a deployed worker"),
    manual("web + desktop typecheck (ci)", "runs in github actions"),
  ],
  "0b lanes and manifests": [
    covered("manifest validation rules", "cd apps/worker && ./node_modules/.bin/vitest run test/versioning.test.ts"),
    covered("public projection", "cd apps/worker && ./node_modules/.bin/vitest run test/public-listing.test.ts"),
    covered("desktop verify mode", "cd apps/desktop && ./node_modules/.bin/tsc --noEmit"),
  ],
  "1 hosted lane": [
    covered("dispatch, ingest, liveness, events", "cd apps/worker && ./node_modules/.bin/vitest run test/dispatch.test.ts test/ingest.test.ts test/liveness.test.ts test/hosted-events.test.ts"),
    covered("pull mode and kit", "cd apps/worker && ./node_modules/.bin/vitest run test/pull-mode.test.ts test/kit.test.ts"),
    covered("ssrf cage", "cd apps/worker && ./node_modules/.bin/vitest run test/safe-fetch.test.ts"),
    manual("real design-partner shift", "needs a partner endpoint deployed"),
  ],
  "2 desktop lane": [
    covered("bundle floor, revocation, grants", "cd apps/worker && ./node_modules/.bin/vitest run test/bundles.test.ts"),
    covered("capability sheet, supervisor, purge", "cd apps/worker && ./node_modules/.bin/vitest run test/capability-sheet.test.ts test/supervisor.test.ts test/data-purge.test.ts"),
    manual("install, run and uninstall on windows", "needs the windows ci runner"),
  ],
  "3 money": [
    covered("split, ledger, kyc, reserve, disputes, economics", "cd apps/worker && ./node_modules/.bin/vitest run test/split.test.ts test/ledger.test.ts test/kyc.test.ts test/reserve.test.ts test/disputes.test.ts test/economics.test.ts"),
    manual("a real split landing in a subaccount", "needs psp sandbox credentials and a confirmed corridor"),
  ],
  "4 opening up": [
    covered("shopper cadence and clock", "cd apps/worker && ./node_modules/.bin/vitest run test/shopper.test.ts test/clock.test.ts"),
    manual("a stranger onboards in under 20 minutes", "needs a second human, by definition"),
  ],
};

let failed = 0;
for (const [gate, rows] of Object.entries(gates)) {
  console.log(`\n${gate}`);
  for (const row of rows) {
    if (row.status === "manual") {
      console.log(`  manual ${row.label} (${row.why})`);
    } else {
      console.log(`  ${row.status === "pass" ? "ok    " : "FAIL  "} ${row.label}`);
      if (row.status === "FAIL") failed += 1;
    }
  }
}

console.log(
  failed === 0
    ? "\ngates: every automatable check passes here. manual rows are named, not assumed."
    : `\ngates: ${failed} failing checks`,
);
process.exit(failed === 0 ? 0 : 1);
