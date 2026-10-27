import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import { VAT_RATE, closeBatch, closeBatchQuery, computeInstruction, recordReversal } from "../src/payments/ledger.ts";

const fakeDb = (rows: ReadonlyArray<{ prefix: string; row: Row | null }> = []) => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const find = (sql: string) => rows.find((entry) => sql.startsWith(entry.prefix));
  const db: DatabaseImpl = {
    all: (sql) => {
      const hit = find(String(sql));
      return Effect.succeed(hit === undefined || hit.row === null ? [] : [hit.row]);
    },
    first: (sql, params) => {
      writes.push({ sql: String(sql), params: params ?? [] });
      return Effect.succeed(find(String(sql))?.row ?? null);
    },
    run: (sql, params) => {
      writes.push({ sql: String(sql), params: params ?? [] });
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  };
  return { db, writes };
};

const splitRows = (count: number): Row[] =>
  Array.from({ length: count }, () => ({
    authorId: "u1",
    grossMinor: 10_000,
    commissionMinor: 2_000,
    netMinor: 8_000,
    psp: "paystack",
    subaccount: "ACCT_1",
    currency: "NGN",
  }));

describe("instruction maths", () => {
  it("puts vat on the commission, not the gross", () => {
    const totals = computeInstruction({
      authorId: "u1",
      period: "2026-10",
      psp: "paystack",
      subaccount: "A",
      currency: "NGN",
      grossMinor: 10_000,
      commissionMinor: 2_000,
      netMinor: 8_000,
    });
    expect(totals.vatMinor).toBe(Math.round(2_000 * VAT_RATE));
  });

  it("withholds on the author share when a rate is given", () => {
    const totals = computeInstruction({
      authorId: "u1",
      period: "2026-10",
      psp: "flutterwave",
      subaccount: "A",
      currency: "NGN",
      grossMinor: 10_000,
      commissionMinor: 2_000,
      netMinor: 8_000,
      whtRate: 0.1,
    });
    expect(totals.whtMinor).toBe(800);
    expect(totals.netMinor).toBe(7_200);
  });
});

describe("no fan-out", () => {
  it("joins exactly one payout account per author, so a two-psp author is not counted twice", () => {
    expect(closeBatchQuery).toContain("a.rowid = (SELECT p.rowid");
    expect(closeBatchQuery).toContain("GROUP BY s.author_id");
  });
});

describe("batch close", () => {
  it("writes one row per author and period, and a rerun writes nothing", async () => {
    const first = fakeDb([
      { prefix: "SELECT s.author_id AS authorId", row: splitRows(1)[0] },
      { prefix: "INSERT INTO payout_instructions", row: { id: "pi_1" } },
    ]);
    const written = await Effect.runPromise(closeBatch(first.db, "2026-10"));
    expect(written).toEqual(["pi_1"]);

    const rerun = fakeDb([
      { prefix: "SELECT s.author_id AS authorId", row: splitRows(1)[0] },
      { prefix: "INSERT INTO payout_instructions", row: null },
    ]);
    const second = await Effect.runPromise(closeBatch(rerun.db, "2026-10"));
    expect(second).toEqual([]);
  });

  it("is idempotent on the unique key, not on the clock", async () => {
    const { db, writes } = fakeDb([
      { prefix: "SELECT s.author_id AS authorId", row: splitRows(1)[0] },
      { prefix: "INSERT INTO payout_instructions", row: { id: "pi_1" } },
    ]);
    await Effect.runPromise(closeBatch(db, "2026-10", "2026-11-01T00:00:00Z"));
    const insert = writes.find((w) => w.sql.includes("INSERT INTO payout_instructions"));
    expect(insert!.sql).toContain("DO NOTHING");
  });
});

describe("reversal wiring", () => {
  it("a reversed transfer points at the refund psp id", async () => {
    const { db, writes } = fakeDb();
    await Effect.runPromise(recordReversal(db, "pi_1", "refund_123"));
    const update = writes.find((w) => w.sql.includes("reversal_ref = ?"));
    expect(update!.params[0]).toBe("refund_123");
    expect(update!.sql).toContain("status = 'reversed'");
  });
});
