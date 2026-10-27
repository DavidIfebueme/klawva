import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import { revokeListing } from "../src/admin/admin.ts";

const fakeDb = (rows: ReadonlyArray<{ prefix: string; row: Row | null }>) => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const find = (sql: string) => rows.find((entry) => sql.startsWith(entry.prefix));
  const db: DatabaseImpl = {
    all: () => Effect.succeed([]),
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

const owner = { prefix: "SELECT owner_id", row: { ownerId: "u1" } };

describe("revoke", () => {
  it("unpublishes and cancels every open task with a reason in the audit", async () => {
    const { db, writes } = fakeDb([
      owner,
      { prefix: "UPDATE agent_listings SET status = 'unpublished'", row: { id: "l1" } },
      { prefix: "SELECT COUNT(*) AS count FROM session_tasks", row: { count: 3 } },
    ]);
    const result = await Effect.runPromise(revokeListing(db, "admin@x", "l1", "review_failed"));
    expect(result.cancelled).toBe(3);
    const cancel = writes.find((w) => w.sql.includes("cancel_requested_at"));
    expect(cancel).toBeDefined();
    const audit = writes.find((w) => w.sql.includes("admin_audit"));
    expect(String(audit!.params[2])).toBe("listing.revoke");
  });

  it("refuses a listing that is not published", async () => {
    const { db } = fakeDb([owner, { prefix: "UPDATE agent_listings SET status = 'unpublished'", row: null }]);
    const exit = await Effect.runPromiseExit(revokeListing(db, "admin@x", "l1", "x"));
    expect(exit._tag).toBe("Failure");
  });
});
