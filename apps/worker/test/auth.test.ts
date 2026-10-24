import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param } from "../src/db/database.ts";
import { stampMarketIfUnset } from "../src/auth/auth.ts";
import { signToken, verifyToken } from "../src/auth/tokens.ts";

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
    const tampered =
      token.slice(0, Math.floor(token.length / 2)) +
      (token[Math.floor(token.length / 2)] === "a" ? "b" : "a") +
      token.slice(Math.floor(token.length / 2) + 1);
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
});

describe("stampMarketIfUnset", () => {
  it("only writes the market when the row still has none, so an existing pick is never clobbered", async () => {
    const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([]),
      first: () => Effect.succeed(null),
      run: (sql, params) => {
        writes.push({ sql, params: params ?? [] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    await Effect.runPromise(stampMarketIfUnset(db, "u1", "in"));
    expect(writes.length).toBe(1);
    expect(writes[0].sql).toContain("AND market IS NULL");
    expect(writes[0].params[0]).toBe("in");
    expect(writes[0].params[2]).toBe("u1");
  });
});
