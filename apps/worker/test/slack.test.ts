import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { verifySlackSignature } from "../src/channels/slack.ts";

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
