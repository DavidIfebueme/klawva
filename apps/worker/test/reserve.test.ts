import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import {
  RESERVE_FLOOR_MINOR,
  holdUntil,
  releaseCohort,
  reserveFor,
  tripwireTripped,
} from "../src/payments/reserve.ts";

const fakeDb = (rows: ReadonlyArray<{ prefix: string; row: Row | null }> = []) => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const find = (sql: string) => rows.find((entry) => sql.startsWith(entry.prefix));
  const db: DatabaseImpl = {
    all: () => Effect.succeed([]),
    first: (sql) => Effect.succeed(find(String(sql))?.row ?? null),
    run: (sql, params) => {
      writes.push({ sql: String(sql), params: params ?? [] });
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  };
  return { db, writes };
};

describe("reserve", () => {
  it("is five percent of commission, with a floor", () => {
    expect(reserveFor(100_000_000)).toBe(5_000_000);
    expect(reserveFor(10_000_000)).toBe(RESERVE_FLOOR_MINOR);
    expect(reserveFor(1_000)).toBe(RESERVE_FLOOR_MINOR);
  });

  it("the tripwire is platform-funded spend against commission, not gross", () => {
    expect(tripwireTripped({ platformFundedMinor: 200_000, commissionMinor: 1_000_000 })).toBe(true);
    expect(tripwireTripped({ platformFundedMinor: 100_000, commissionMinor: 1_000_000 })).toBe(false);
    expect(tripwireTripped({ platformFundedMinor: 1, commissionMinor: 0 })).toBe(false);
  });

  it("holds for the cohort window from the start of the period", () => {
    expect(holdUntil("2026-10").startsWith("2026-12-30")).toBe(true);
  });
});

describe("cohort release", () => {
  const held = { prefix: "SELECT held_until AS heldUntil", row: { heldUntil: "2026-01-01T00:00:00Z", releasedAt: null } };

  it("will not release while a dispute in the cohort is open", async () => {
    const { db } = fakeDb([held]);
    const released = await Effect.runPromise(
      releaseCohort(db, "2026-10", 1, new Date("2026-12-31T00:00:00Z")),
    );
    expect(released).toBe(false);
  });

  it("releases only after the hold and with no open disputes", async () => {
    const { db, writes } = fakeDb([held]);
    const released = await Effect.runPromise(
      releaseCohort(db, "2026-10", 0, new Date("2026-12-31T00:00:00Z")),
    );
    expect(released).toBe(true);
    expect(writes.some((w) => w.sql.includes("released_at = ?"))).toBe(true);
  });
});
