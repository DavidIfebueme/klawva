import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";

import type { DatabaseImpl, Param } from "../src/db/database.ts";
import { pollWorkingTasks } from "../src/hosted/poller.ts";

const manifest = JSON.stringify({
  soul: "x",
  schema: 2,
  runtime: {
    kind: "hosted",
    billing: "author-metered",
    transport: ["web"],
    hosted: { mode: "push", cardUrl: "https://a.dev/.well-known/agent-card.json" },
  },
  report: { requireEvidence: true, minEvidence: 1 },
});

const taskRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  taskId: "tsk_a",
  listingId: "l1",
  listingVersion: 1,
  dispatchedAt: new Date().toISOString(),
  lastEventAt: new Date().toISOString(),
  lastPollState: null,
  cancelDeliveredAt: null,
  briefHash: "bh",
  manifest,
  ...overrides,
});

const dohAnswer = JSON.stringify({ Answer: [{ data: "93.184.216.34" }] });
const taskState = (state: string) =>
  JSON.stringify({ id: "tsk_a", status: { state } });

const stateOf = (outcome: { readonly ok: true; readonly state: string } | { readonly ok: false; readonly reason: string } | undefined) =>
  outcome?.ok === true ? outcome.state : undefined;

describe("the hosted task poller", () => {
  it("expires a task past its wall clock before any network call", async () => {
    const old = new Date(Date.now() - 90 * 60 * 60 * 1_000).toISOString();
    const writes: Array<{ sql: string }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([taskRow({ dispatchedAt: old })]),
      first: () => Effect.succeed(null),
      run: (sql) => {
        writes.push({ sql: String(sql) });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    const fetcher = vi.fn();
    const outcomes = await Effect.runPromise(pollWorkingTasks(db, {}, fetcher));
    expect(outcomes).toEqual([{ ok: true, taskId: "tsk_a", state: "expired" }]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(writes.some((w) => w.sql.includes("state = 'expired'"))).toBe(true);
  });

  it("fails a silent task at the idle threshold and never calls the author", async () => {
    const silent = new Date(Date.now() - 31 * 60 * 1_000).toISOString();
    const writes: Array<{ sql: string }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([taskRow({ lastEventAt: silent })]),
      first: () => Effect.succeed(null),
      run: (sql) => {
        writes.push({ sql: String(sql) });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    const fetcher = vi.fn();
    const outcomes = await Effect.runPromise(pollWorkingTasks(db, {}, fetcher));
    expect(stateOf(outcomes[0])).toBe("failed");
    expect(fetcher).not.toHaveBeenCalled();
    expect(writes.some((w) => w.sql.includes("failure_reason = 'idle'"))).toBe(true);
  });

  it("delivers a requested cancel to the author and disables the listing when the author ignores it", async () => {
    const writes: Array<{ sql: string }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([taskRow({ cancelDeliveredAt: null })]),
      first: () => Effect.succeed({ requestedAt: new Date().toISOString(), ignored: 2, listingId: "l1" }),
      run: (sql) => {
        writes.push({ sql: String(sql) });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    const fetcher = vi.fn(async (url: string) =>
      url.includes("dns-query")
        ? new Response(JSON.stringify({ Answer: [{ data: "93.184.216.34" }] }), { status: 200 })
        : new Response(taskState("TASK_STATE_WORKING"), { status: 200 }),
    );
    const outcomes = await Effect.runPromise(pollWorkingTasks(db, {}, fetcher));
    expect(stateOf(outcomes[0])).toBe("cancelled");
    expect(writes.some((w) => w.sql.includes("cancel_delivered_at ="))).toBe(true);
    expect(writes.some((w) => w.sql.includes("ignored_cancels = ignored_cancels + 1"))).toBe(true);
    expect(writes.some((w) => w.sql.includes("UPDATE agent_listings"))).toBe(true);
  });

  it("marks a working task polled and keeps it working", async () => {
    const writes: Array<{ sql: string }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([taskRow()]),
      first: () => Effect.succeed(null),
      run: (sql) => {
        writes.push({ sql: String(sql) });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    const fetcher = vi.fn(async (url: string) =>
      url.includes("dns-query")
        ? new Response(JSON.stringify({ Answer: [{ data: "93.184.216.34" }] }), { status: 200 })
        : new Response(taskState("TASK_STATE_WORKING"), { status: 200 }),
    );
    const outcomes = await Effect.runPromise(pollWorkingTasks(db, {}, fetcher));
    expect(outcomes[0]).toEqual({ ok: true, taskId: "tsk_a", state: "working" });
    expect(writes.some((w) => w.sql.includes("last_poll_state ="))).toBe(true);
  });

  it("skips rows that do not decode", async () => {

    const writes: Array<{ sql: string }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([{ broken: true }]),
      first: () => Effect.succeed(null),
      run: (sql) => {
        writes.push({ sql: String(sql) });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    const fetcher = vi.fn();
    const outcomes = await Effect.runPromise(pollWorkingTasks(db, {}, fetcher));
    expect(outcomes).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
