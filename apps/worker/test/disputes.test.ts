import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import {
  dismissDispute,
  escalateDispute,
  openDispute,
  openDisputesForListing,
  recordRefund,
  resolveWithRerun,
} from "../src/marketplace/disputes.ts";

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
    batch: (statements) => {
      for (const statement of statements) {
        writes.push({ sql: statement.sql, params: statement.params ?? [] });
      }
      return Effect.void;
    },
    changed: () => Effect.succeed(0),
  };
  return { db, writes };
};

const base = {
  sessionId: "s1",
  taskId: "tsk_1",
  briefHash: "bh",
  artifactHash: "ah",
  reason: "no_artifact",
  refundMinor: 5_000,
  refundSource: "platform_funded" as const,
  refundPspId: "rf_1",
};

describe("disputes", () => {
  it("opens with the evidence tuple on the row", async () => {
    const { db, writes } = dbWithNoop();
    const id = await Effect.runPromise(openDispute(db, { ...base, openedBy: "customer" }));
    expect(id.length).toBeGreaterThan(10);
    const insert = writes.find((w) => w.sql.includes("INSERT INTO disputes"));
    expect(insert!.params[2]).toBe("tsk_1");
    expect(insert!.params[3]).toBe("bh");
    expect(insert!.params[4]).toBe("ah");
  });

  it("a refund always writes its dispute in the same call", async () => {
    const { db, writes } = dbWithNoop();
    const result = await Effect.runPromise(recordRefund(db, base));
    expect(result.structural).toBe(true);
    expect(writes.filter((w) => w.sql.includes("INSERT INTO disputes")).length).toBe(1);
    const refund = writes.find((w) => w.sql.includes("UPDATE payments SET refund_minor"));
    expect(refund!.params[3]).toBe("rf_1");
    expect(writes.some((w) => w.sql.includes("resolved_refund"))).toBe(true);
  });

  it("a quality dispute is not structural", async () => {
    const { db } = dbWithNoop();
    const result = await Effect.runPromise(
      recordRefund(db, { ...base, reason: "quality" }),
    );
    expect(result.structural).toBe(false);
  });

  it("a rerun resolution links the new session and only from an open state", async () => {
    const { db, writes } = dbWithNoop();
    await Effect.runPromise(resolveWithRerun(db, "d1", "s2"));
    const update = writes.find((w) => w.sql.includes("resolved_rerun"));
    expect(update!.params[0]).toBe("s2");
    expect(update!.sql).toContain("state IN ('opened','evidence_pending','escalated')");
  });

  it("dismissal carries the audit reference", async () => {
    const { db, writes } = dbWithNoop();
    await Effect.runPromise(dismissDispute(db, "d1", "audit_9"));
    expect(writes[0].params[0]).toBe("audit_9");
  });

  it("escalation is its own state", async () => {
    const { db, writes } = dbWithNoop();
    await Effect.runPromise(escalateDispute(db, "d1"));
    expect(writes[0].sql).toContain("state = 'escalated'");
  });

  it("counts only live disputes for a listing, for the cohort release", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT COUNT(*) AS count FROM disputes", row: { count: 2 } },
    ]);
    expect(await Effect.runPromise(openDisputesForListing(db, "l1"))).toBe(2);
  });
});

function dbWithNoop() {
  return fakeDb();
}
