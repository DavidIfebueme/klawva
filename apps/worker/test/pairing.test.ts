import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import { approvePairCode, claimPairCode } from "../src/auth/pairing.ts";

type Writes = Array<{ readonly sql: string; readonly params: ReadonlyArray<Param> }>;

const fakeDb = (
  firstRows: ReadonlyArray<Row | null>,
): { db: DatabaseImpl; writes: Writes } => {
  const writes: Writes = [];
  const queue = [...firstRows];
  const db: DatabaseImpl = {
    all: () => Effect.succeed([]),
    first: () => Effect.succeed(queue.length > 0 ? (queue.shift() ?? null) : null),
    run: (sql, params) => {
      writes.push({ sql, params: params ?? [] });
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(1),
  };
  return { db, writes };
};

describe("pair codes", () => {
  it("stores the approved code for the user", async () => {
    const { db, writes } = fakeDb([]);
    await Effect.runPromise(approvePairCode(db, "u1", "ABCD-2345", "work laptop"));
    const insert = writes.find((w) => w.sql.includes("INSERT INTO pair_codes"));
    expect(insert).toBeDefined();
    expect(insert!.params.slice(0, 3)).toEqual(["ABCD-2345", "u1", "work laptop"]);
  });

  it("claims a fresh code once, issuing a device token", async () => {
    const fresh = {
      userId: "u1",
      name: "work laptop",
      createdAt: new Date().toISOString(),
    };
    const { db, writes } = fakeDb([fresh]);
    const claimed = await Effect.runPromise(claimPairCode(db, "ABCD-2345"));
    expect(claimed).not.toBeNull();
    expect(claimed!.token.length).toBeGreaterThan(20);
    expect(writes.some((w) => w.sql.includes("DELETE FROM pair_codes"))).toBe(true);
  });

  it("refuses an unknown code", async () => {
    const { db } = fakeDb([null]);
    const claimed = await Effect.runPromise(claimPairCode(db, "NOPE-0000"));
    expect(claimed).toBeNull();
  });

  it("refuses a stale code and still cleans it up", async () => {
    const stale = {
      userId: "u1",
      name: "old laptop",
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };
    const { db, writes } = fakeDb([stale]);
    const claimed = await Effect.runPromise(claimPairCode(db, "STAL-E111"));
    expect(claimed).toBeNull();
    expect(writes.some((w) => w.sql.includes("DELETE FROM pair_codes"))).toBe(true);
  });
});
