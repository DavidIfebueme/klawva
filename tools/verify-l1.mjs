#!/usr/bin/env node
// L1: the whole worker locally, the way a customer, a device and an author hit it.
// needs: wrangler dev --local with OWNER_ONLY=true (the stricter case).
const base = process.env.KLAWVA_WORKER_URL ?? "http://127.0.0.1:8787";

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (cause) {
    failures += 1;
    console.log(`  FAIL ${name}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
};
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const json = async (path, init) => {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json().catch(() => null);
  return { status: response.status, body, response };
};

await check("health answers", async () => {
  const { status } = await json("/health");
  expect(status === 200, `status ${status}`);
});

await check("catalog is public even with the owner gate on", async () => {
  const { status, body } = await json("/api/listings");
  expect(status === 200, `status ${status}`);
  expect(Array.isArray(body), "catalog is not an array");
});

await check("claim answers 404 for an unknown code, not 500", async () => {
  const { status } = await json("/api/devices/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "TEST-0000" }),
  });
  expect(status === 404, `status ${status}`);
});

await check("twiml relay is public and clamped", async () => {
  const response = await fetch(`${base}/api/voice/twiml?maxSeconds=120`);
  const body = await response.text();
  expect(response.status === 200, `status ${response.status}`);
  expect(body.includes("This call is from an AI employee"), "no disclosure line");
  expect(body.includes("up to 120 seconds"), "stop not rendered");
  expect(response.headers.get("content-type")?.includes("xml"), "not xml");
});

await check("twiml clamps an absurd stop", async () => {
  const body = await (await fetch(`${base}/api/voice/twiml?maxSeconds=999999`)).text();
  expect(body.includes("up to 600 seconds"), "clamp did not apply");
});

await check("pull claim is exempt from the owner gate and rejects a bad token itself", async () => {
  const { status, body } = await json("/api/agent/tasks/claim", {
    method: "POST",
    headers: { authorization: "Bearer al_nope" },
  });
  expect(status === 401, `status ${status}`);
  expect(body?.error === "bad_token", JSON.stringify(body));
});

await check("the kit endpoint is behind the same token", async () => {
  const { status } = await json("/api/agent/kit", {
    method: "POST",
    headers: { authorization: "Bearer al_nope" },
  });
  expect(status === 401, `status ${status}`);
});

await check("the owner gate still covers everything else", async () => {
  const { status } = await json("/api/author/me");
  expect(status === 403 || status === 401, `status ${status}`);
});

console.log(failures === 0 ? "L1 passed: the wire is whole" : `L1 failed: ${failures} checks`);
process.exit(failures === 0 ? 0 : 1);
