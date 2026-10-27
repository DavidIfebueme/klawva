import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import { reviseListing } from "../src/studio/studio.ts";

const fakeDb = (
  rows: ReadonlyArray<{ prefix: string; row: Row | null }>,
): { db: DatabaseImpl; writes: Array<{ sql: string; params: ReadonlyArray<Param> }> } => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const find = (sql: string) => rows.find((entry) => sql.startsWith(entry.prefix));
  return {
    db: {
      all: () => Effect.succeed([]),
      first: (sql) => Effect.succeed(find(String(sql))?.row ?? null),
      run: (sql, params) => {
        writes.push({ sql: String(sql), params: params ?? [] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    },
    writes,
  };
};

const published = {
  id: "l1",
  slug: "cellar",
  name: "Cellar",
  tagline: "keeps the notes",
  category: "data",
  status: "published",
  priceMinor: 5000,
  version: 3,
};

const input = {
  name: "Cellar",
  tagline: "keeps the notes",
  category: "data",
  priceMinor: 6000,
  budgetMinor: 1000,
  briefFields: ["task"],
  soul: "you are cellar",
};

describe("revising a published listing", () => {
  it("opens version n+1 as a draft and leaves the live version untouched", async () => {
    const { db, writes } = fakeDb([{ prefix: "SELECT id AS id, slug", row: published }]);
    const result = await Effect.runPromise(reviseListing(db, "u1", "l1", input));
    expect(result.version).toBe(4);
    const insert = writes.find((w) => w.sql.includes("INSERT INTO listing_versions"));
    expect(insert).toBeDefined();
    expect(insert!.params[2]).toBe(4);
    expect(insert!.sql).toContain("'draft'");
    const rewrite = writes.find((w) => w.sql.startsWith("UPDATE listing_versions SET soul"));
    expect(rewrite).toBeUndefined();
  });

  it("refuses to revise a listing that is not live", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT id AS id, slug", row: { ...published, status: "draft" } },
    ]);
    const exit = await Effect.runPromiseExit(reviseListing(db, "u1", "l1", input));
    expect(exit._tag).toBe("Failure");
  });
});

describe("a revision can go back through review", () => {
  it("a published listing still publishes its approved revision and moves the pointer", async () => {
    const { db, writes } = (() => {
      const rows = [
        { prefix: "SELECT id AS id, slug", row: published },
      ] as const;
      const writes: Array<{ sql: string; params: ReadonlyArray<unknown> }> = [];
      const db: DatabaseImpl = {
        all: () => Effect.succeed([]),
        first: (sql: string) =>
          Effect.succeed(rows.find((r) => String(sql).startsWith(r.prefix))?.row ?? null),
        run: (sql: string, params?: ReadonlyArray<unknown>) => {
          writes.push({ sql: String(sql), params: params ?? [] });
          return Effect.void;
        },
        batch: () => Effect.void,
        changed: () => Effect.succeed(0),
      };
      return { db, writes };
    })();
    const result = await Effect.runPromise(reviseListing(db, "u1", "l1", input));
    expect(result.version).toBe(4);
    expect(writes.some((w) => w.sql.includes("INSERT INTO listing_versions"))).toBe(true);
  });
});
