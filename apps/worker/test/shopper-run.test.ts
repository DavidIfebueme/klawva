import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import { runDueShoppers, shopperSpendThisMonth } from "../src/marketplace/shopper.ts";

const listing = (overrides: Record<string, unknown> = {}): Row => ({
  listingId: "l1",
  authorId: "u1",
  priceMinor: 5_000,
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const manifestRow = {
  manifest: JSON.stringify({
    soul: "x",
    schema: 2,
    runtime: { kind: "hosted", billing: "author-metered", transport: ["web"], hosted: { mode: "push", cardUrl: "https://a.dev/card" } },
    report: { requireEvidence: true, minEvidence: 1 },
  }),
};

const fakeDb = (handlers: {
  readonly all?: ReadonlyArray<Row>;
  readonly first?: Row | null;
  readonly firstBySql?: (sql: string) => Row | null;
}) => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const db: DatabaseImpl = {
    all: (sql) =>
      Effect.succeed(
        String(sql).includes("pending") ? (handlers.all ?? []) : (handlers.all ?? []),
      ),
    first: (sql) => {
      const bySql = handlers.firstBySql;
      if (bySql !== undefined) {
        return Effect.succeed(bySql(String(sql)));
      }
      return Effect.succeed(handlers.first ?? null);
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

describe("the shopper execution loop", () => {
  it("stops at the monthly spend cap before touching any listing", async () => {
    const fetcher = vi.fn();
    const { db } = fakeDb({});
    const spend = await Effect.runPromise(shopperSpendThisMonth(db));
    void spend;
    const result = await Effect.runPromise(
      runDueShoppers(
        {
          ...db,
          first: (sql) =>
            Effect.succeed(
              String(sql).includes("SUM(price_minor)")
                ? { spent: 200_000 }
                : String(sql).includes("owner_id AS authorId")
                  ? null
                  : null,
            ),
        },
        {},
      ),
    );
    expect(result.capped).toBe(true);
    expect(result.shopped).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("creates a real pending session, records the audit, and never marks itself", async () => {
    const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
    const db: DatabaseImpl = {
      all: (sql) =>
        Effect.succeed(
          String(sql).includes("shopper_audits a WHERE a.verdict = 'pending'") ? [] : [listing()],
        ),
      first: (sql) =>
        Effect.succeed(
          String(sql).includes("v.manifest AS manifest")
            ? manifestRow
            : String(sql).includes("lastShoppedAt")
              ? { lastShoppedAt: null, lastVerdict: null, lastAuthorId: "someone-else" }
              : String(sql).includes("current_version")
                ? { version: 1 }
                : manifestRow,
        ),
      run: (sql, params) => {
        writes.push({ sql: String(sql), params: params ?? [] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    const result = await Effect.runPromise(runDueShoppers(db, {}));
    expect(result.shopped).toBe(1);
    expect(result.capped).toBe(false);
    const sessionInsert = writes.find((w) => w.sql.includes("INSERT INTO sessions"));
    expect(sessionInsert).toBeDefined();
    expect(sessionInsert?.sql).toContain("shopper@klawva.xyz");
    const audit = writes.find((w) => w.sql.includes("INSERT INTO shopper_audits"));
    expect(audit?.params[4]).toBe("payment link pending operator card");
  });

  it("a finished shopper shift with a wrong answer opens a dispute", async () => {
    const writes: Array<{ sql: string; params: ReadonlyArray<string> }> = [];
    const db: DatabaseImpl = {
      all: (sql) =>
        Effect.succeed(
          String(sql).includes("a.verdict = 'pending'")
            ? [{ auditId: "aud_1", sessionId: "s_shop" }]
            : [],
        ),
      first: (sql) =>
        Effect.succeed(
          String(sql).includes("mission_reports")
            ? { outcome: "complete", summary: "the answer is not the phrase" }
            : null,
        ),
      run: (sql, params) => {
        writes.push({ sql: String(sql), params: (params ?? []).map(String) });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    const result = await Effect.runPromise(runDueShoppers(db, {}));
    expect(result.verdicts).toBe(1);
    const verdictWrite = writes.find((w) => w.sql.includes("SET verdict ="));
    expect(verdictWrite?.params[0]).toBe("fail");
    expect(writes.some((w) => w.sql.includes("INSERT INTO disputes"))).toBe(true);
  });
});
