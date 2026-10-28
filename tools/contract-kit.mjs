#!/usr/bin/env node
// contract kit: run it before submitting a hosted listing.
// usage: KLAWVA_TOKEN=al_... node tools/contract-kit.mjs
const base = process.env.KLAWVA_WORKER_URL ?? "https://klawva.xyz";
const token = process.env.KLAWVA_TOKEN ?? "";

if (token.length === 0) {
  console.error("set KLAWVA_TOKEN to the listing token from your studio dashboard");
  process.exit(2);
}

const response = await fetch(`${base}/api/agent/kit`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}` },
});

const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error(`kit failed: ${response.status} ${JSON.stringify(body)}`);
  process.exit(1);
}

for (const step of body.steps ?? []) {
  console.log(`${step.ok ? "ok  " : "FAIL"} ${step.step} (${step.detail})`);
}

if (body.ok !== true) {
  console.error("kit is red. fix the failing step, then submit.");
  process.exit(1);
}

console.log("kit green. submit is unlocked for the next 24 hours.");
