import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import {
  applyTripwire,
  guaranteeHoursForSession,
  releaseEligibleCohorts,
  reserveFor,
  tripwireTripped,
} from "../src/payments/reserve.ts";

const fakeDb = (rows: {
  readonly pending?: ReadonlyArray<Row>;
  readonly policy?: Row | null;
  readonly refunds?: Row | null;
  readonly splits?: Row | null;
  readonly held?: Row | null;
}) => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const db: DatabaseImpl = {
    all: () => Effect.succeed(rows.pending ?? []),
    first: (sql) =>
      Effect.succeed(
        String(sql).includes("refund_policy")
          ? (rows.policy ?? null)
          : String(sql).includes("refund_minor")
            ? (rows.refunds ?? null)
            : String(sql).includes("commission_minor")
              ? (rows.splits ?? null)
              : String(sql).includes("held_until")
                ? (rows.held ?? null)
                : null,
      ),
    run: (sql, params) => {
      writes.push({ sql: String(sql), params: params ?? [] });
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  };
  return { db, writes };
};

describe("the refund reserve and the tripwire", () => {
  it("keeps the reserve above the floor", () => {
    expect(reserveFor(0)).toBe(2_500_000);
    expect(reserveFor(1_000_000)).toBe(2_500_000);
    expect(reserveFor(100_000_000)).toBe(5_000_000);
  });

  it("trips at 15 percent of the trailing window", () => {
    expect(tripwireTripped({ platformFundedMinor: 15, commissionMinor: 100 })).toBe(false);
    expect(tripwireTripped({ platformFundedMinor: 16, commissionMinor: 100 })).toBe(true);
    expect(tripwireTripped({ platformFundedMinor: 100, commissionMinor: 0 })).toBe(false);
  });

  it("reads the windowed spend from the payments ledger", async () => {
    const { db } = fakeDb({
      refunds: { platformFunded: 500 },
      splits: { commission: 1000 },
    });
    const { windowSpend } = await import("../src/payments/reserve.ts");
    const spend = await Effect.runPromise(windowSpend(db, new Date()));
    expect(spend.platformFundedMinor).toBe(500);
    expect(spend.commissionMinor).toBe(1000);
  });

  it("the guarantee a hire gets is the latest policy in force at hire time", async () => {
    const { db } = fakeDb({
      policy: { guaranteeHours: 24 },
    });
    const hours = await Effect.runPromise(guaranteeHoursForSession(db, "2020-01-01T00:00:00Z"));
    expect(hours).toBe(24);
  });

  it("the tripwire drops the guarantee for future hires only", async () => {
    const { db, writes } = fakeDb({
      refunds: { platformFunded: 90 },
      splits: { commission: 100 },
      policy: { guaranteeHours: 72 },
    });
    const dropped = await Effect.runPromise(applyTripwire(db, new Date()));
    expect(dropped).toBe(true);
    const write = writes.find((w) => w.sql.includes("UPDATE refund_policy"));
    expect(write?.params[1]).toBe(24);
  });

  it("does not re-drop when the guarantee is already at the floor", async () => {
    const { db } = fakeDb({
      refunds: { platformFunded: 90 },
      splits: { commission: 100 },
      policy: { guaranteeHours: 24 },
    });
    const dropped = await Effect.runPromise(applyTripwire(db, new Date()));
    expect(dropped).toBe(false);
  });

  it("releases only cohorts with no open disputes past the hold", async () => {
    const { db } = fakeDb({
      pending: [
        { period: "2026-08" },
        { period: "2026-09" },
      ],
      held: { heldUntil: "2026-01-01T00:00:00Z", releasedAt: null },
    });
    const released = await Effect.runPromise(
      releaseEligibleCohorts(db, (period) =>
        Effect.succeed(period === "2026-08" ? 1 : 0),
      ),
    );
    expect(released).toBe(1);
  });
});
