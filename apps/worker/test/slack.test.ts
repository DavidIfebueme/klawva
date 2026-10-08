import { afterEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import { postMessage, verifySlackSignature } from "../src/channels/slack.ts";

const secret = "s3cr3t";
const body = '{"type":"event_callback"}';
const now = Math.floor(Date.now() / 1000);

const sign = async (timestamp: number, payload: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`v0:${timestamp}:${payload}`),
  );
  const hex = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `v0=${hex}`;
};

describe("slack signature", () => {
  it("accepts a valid signature", async () => {
    const valid = await Effect.runPromise(
      verifySlackSignature(secret, String(now), body, await sign(now, body)),
    );
    expect(valid).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const valid = await Effect.runPromise(
      verifySlackSignature(secret, String(now), `${body} `, await sign(now, body)),
    );
    expect(valid).toBe(false);
  });

  it("rejects a stale timestamp", async () => {
    const old = now - 4000;
    const valid = await Effect.runPromise(
      verifySlackSignature(secret, String(old), body, await sign(old, body)),
    );
    expect(valid).toBe(false);
  });

  it("fails closed with no secret", async () => {
    const valid = await Effect.runPromise(
      verifySlackSignature("", String(now), body, await sign(now, body)),
    );
    expect(valid).toBe(false);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("slack send failures", () => {
  it("fails when slack reports ok false on a 200", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        Response.json({ ok: false, error: "channel_not_found" }),
      ),
    );
    const outcome = await Effect.runPromise(
      Effect.result(postMessage("token", "C1", "hello")),
    );
    expect(outcome._tag).toBe("Failure");
  });

  it("succeeds when slack reports ok true", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ ok: true })));
    const outcome = await Effect.runPromise(
      Effect.result(postMessage("token", "C1", "hello")),
    );
    expect(outcome._tag).toBe("Success");
  });
});
