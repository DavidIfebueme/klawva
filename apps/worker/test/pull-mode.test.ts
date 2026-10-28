import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import { claimTask, submitEvents } from "../src/hosted/api.ts";
import { issueJobToken, issueListingToken, listingForToken, taskForJobToken } from "../src/hosted/tokens.ts";

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

describe("agent tokens", () => {
  it("issues a listing token and resolves it back to the listing", async () => {
    const { db, writes } = fakeDb();
    const token = await Effect.runPromise(issueListingToken(db, "l1"));
    expect(token.startsWith("al_")).toBe(true);
    expect(writes[0].sql).toContain("INSERT INTO agent_tokens");
    expect(String(writes[0].params[2])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an unknown listing token", async () => {
    const { db } = fakeDb();
    expect(await Effect.runPromise(listingForToken(db, "al_nope"))).toBeNull();
  });

  it("job tokens carry a task and expire", async () => {
    const { db, writes } = fakeDb();
    const token = await Effect.runPromise(
      issueJobToken(db, "tsk_1", new Date(Date.now() - 1000).toISOString()),
    );
    expect(writes[0].sql).toContain("INSERT INTO job_tokens");
    expect(token.startsWith("jt_")).toBe(true);
  });

  it("an expired job token resolves to nothing", async () => {
    const { db } = fakeDb([
      {
        prefix: "SELECT task_id AS taskId, expires_at AS expiresAt FROM job_tokens",
        row: { taskId: "tsk_1", expiresAt: new Date(Date.now() - 1000).toISOString() },
      },
    ]);
    expect(await Effect.runPromise(taskForJobToken(db, "jt_x"))).toBeNull();
  });
});

describe("pull claim", () => {
  it("refuses a claim without a valid listing token", async () => {
    const { db } = fakeDb();
    const response = await Effect.runPromise(claimTask(db, "al_bad"));
    expect(response.status).toBe(401);
  });

  it("returns 204 with a backoff hint when there is nothing to do", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT listing_id AS listingId FROM agent_tokens", row: { listingId: "l1" } },
    ]);
    const response = await Effect.runPromise(claimTask(db, "al_ok"));
    expect(response.status).toBe(204);
    expect(response.retryAfter).toBe(15);
  });

  it("rejects an event batch above the cap", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT task_id AS taskId, expires_at AS expiresAt FROM job_tokens", row: { taskId: "tsk_1", expiresAt: new Date(Date.now() + 60_000).toISOString() } },
    ]);
    const big = JSON.stringify({ events: Array.from({ length: 51 }, () => ({ kind: "message", payload: "x" })) });
    const response = await Effect.runPromise(submitEvents(db, "tsk_1", "jt_x", big));
    expect(response.status).toBe(400);
  });

  it("refuses a job token for a different task", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT task_id AS taskId, expires_at AS expiresAt FROM job_tokens", row: { taskId: "tsk_other", expiresAt: new Date(Date.now() + 60_000).toISOString() } },
    ]);
    const response = await Effect.runPromise(
      submitEvents(db, "tsk_1", "jt_x", JSON.stringify({ events: [{ kind: "message", payload: "hi" }] })),
    );
    expect(response.status).toBe(401);
  });
});

describe("claim is usable after a restart", () => {
  it("always returns a token, never null, so a re-claim can authenticate", async () => {
    const { db, writes } = fakeDb([
      { prefix: "SELECT listing_id AS listingId FROM agent_tokens", row: { listingId: "l1" } },
      {
        prefix: "SELECT t.id AS id",
        row: {
          id: "tsk_1",
          sessionId: "s1",
          state: "working",
          briefHash: "bh",
          version: 1,
          brief: "{}",
        },
      },
      { prefix: "SELECT s.window_end AS windowEnd", row: { windowEnd: null } },
    ]);
    const response = await Effect.runPromise(claimTask(db, "al_ok"));
    expect(response.status).toBe(200);
    const body = response.body as { jobToken: string };
    expect(typeof body.jobToken).toBe("string");
    expect(body.jobToken.startsWith("jt_")).toBe(true);
    const upsert = writes.find((w) => w.sql.includes("INSERT INTO job_tokens"));
    expect(upsert!.sql).toContain("ON CONFLICT(task_id)");
  });
});
