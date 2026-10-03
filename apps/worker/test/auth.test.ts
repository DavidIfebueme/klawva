import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { constantTimeEqual, signToken, verifyToken } from "../src/auth/tokens.ts";

const secret = "test-secret";
const future = Math.floor(Date.now() / 1000) + 3600;

describe("auth tokens", () => {
  it("round trips a signed token", async () => {
    const token = await Effect.runPromise(
      signToken(secret, { email: "a@b.com", exp: future, scope: "session" }),
    );
    const payload = await Effect.runPromise(verifyToken(secret, token));
    expect(payload.email).toBe("a@b.com");
    expect(payload.scope).toBe("session");
  });

  it("rejects a tampered token", async () => {
    const token = await Effect.runPromise(
      signToken(secret, { email: "a@b.com", exp: future, scope: "session" }),
    );
    const tampered = `${token.slice(0, -1)}0`;
    const result = await Effect.runPromise(
      Effect.result(verifyToken(secret, tampered)),
    );
    expect(result._tag).toBe("Failure");
  });

  it("rejects an expired token", async () => {
    const token = await Effect.runPromise(
      signToken(secret, { email: "a@b.com", exp: 1, scope: "session" }),
    );
    const result = await Effect.runPromise(
      Effect.result(verifyToken(secret, token)),
    );
    expect(result._tag).toBe("Failure");
  });

  it("compares in constant time", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
  });
});
