import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import {
  acknowledgeCancel,
  appendEvent,
  ignoredCancelsSince,
  requestCancel,
  shouldDisableListing,
  taskHealth,
} from "../src/hosted/events.ts";

const dbWith = (rows: ReadonlyArray<{ prefix: string; row: Row | null }> = []) => {
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

const at = (iso: string) => new Date(iso);

describe("task health", () => {
  it("is healthy inside five minutes", () => {
    expect(taskHealth({ lastEventAt: "2026-10-27T10:00:00Z", now: at("2026-10-27T10:04:00Z") })).toBe("healthy");
  });

  it("degrades at five minutes and pauses at thirty", () => {
    expect(taskHealth({ lastEventAt: "2026-10-27T10:00:00Z", now: at("2026-10-27T10:06:00Z") })).toBe("degraded");
    expect(taskHealth({ lastEventAt: "2026-10-27T10:00:00Z", now: at("2026-10-27T10:31:00Z") })).toBe("paused");
  });

  it("never pauses earlier than the manifest idle floor", () => {
    expect(
      taskHealth({
        lastEventAt: "2026-10-27T10:00:00Z",
        now: at("2026-10-27T10:05:00Z"),
        limits: { minIdleSeconds: 3_600, maxWallClockSeconds: 86_400, maxEvents: 500, maxEventBytes: 4_096, maxArtifactBytes: 65_536 },
      }),
    ).toBe("degraded");
  });
});

describe("bounded event log", () => {
  it("computes the sequence inside the insert, so two workers cannot reuse a seq", async () => {
    const { db, writes } = dbWith();
    const result = await Effect.runPromise(
      appendEvent(db, { taskId: "tsk_1", kind: "task", payload: "hi" }),
    );
    expect(result).toBe("recorded");
    const insert = writes.find((w) => w.sql.includes("INSERT INTO task_events"));
    expect(insert!.sql).toContain("MAX(seq) + 1, 0");
    expect(insert!.sql).toContain("ON CONFLICT(task_id, seq) DO NOTHING");
  });

  it("fails the task at the event cap instead of truncating silently", async () => {
    const { db, writes } = dbWith();
    const counting = {
      ...db,
      first: () => Effect.succeed({ count: 501 }),
    } as unknown as DatabaseImpl;
    const result = await Effect.runPromise(
      appendEvent(counting, { taskId: "tsk_1", kind: "task", payload: "hi", maxEvents: 500 }),
    );
    expect(result).toBe("event_cap");
    expect(writes.some((w) => w.sql.includes("failure_reason = 'event_cap'"))).toBe(true);
  });

  it("clips a payload to the byte cap", async () => {
    const { db, writes } = dbWith();
    await Effect.runPromise(
      appendEvent(db, { taskId: "tsk_1", kind: "task", payload: "x".repeat(9_000), maxEventBytes: 100 }),
    );
    const insert = writes.find((w) => w.sql.includes("INSERT INTO task_events"));
    expect(String(insert!.params[3]).length).toBe(100);
  });
});

describe("cancel is ours, never the author's claim", () => {
  it("records a cancel request once", async () => {
    const { db, writes } = dbWith();
    await Effect.runPromise(requestCancel(db, "tsk_1"));
    expect(writes[0].sql).toContain("cancel_requested_at = ?");
    expect(writes[0].sql).toContain("cancel_requested_at IS NULL");
  });

  it("marks the task cancelled at our layer on acknowledgement", async () => {
    const { db, writes } = dbWith();
    await Effect.runPromise(acknowledgeCancel(db, "tsk_1"));
    expect(writes[0].sql).toContain("state = 'cancelled'");
  });

  it("disables a listing after two ignored cancels in the window", async () => {
    const { db } = dbWith([
      { prefix: "SELECT COUNT(*) AS count FROM session_tasks", row: { count: 2 } },
    ]);
    const ignored = await Effect.runPromise(
      ignoredCancelsSince(db, "l1", "2026-09-27T00:00:00Z"),
    );
    expect(shouldDisableListing(ignored)).toBe(true);
    expect(shouldDisableListing(1)).toBe(false);
  });
});

describe("the sweep pauses a silent task", () => {
  it("selects only tasks idle for thirty minutes and marks them paused", async () => {
    const { pausedTasks } = await import("../src/lifecycle/lifecycle.ts");
    const now = new Date("2026-10-27T12:00:00Z");
    const db = {
      all: () =>
        Effect.succeed([
          { taskId: "t1", sessionId: "s1", lastEventAt: "2026-10-27T11:10:00Z", customerEmail: "a@b.com" },
          { taskId: "t2", sessionId: "s2", lastEventAt: "2026-10-27T11:45:00Z", customerEmail: "c@d.com" },
        ]),
      first: () => Effect.succeed(null),
      run: () => Effect.void,
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    } as unknown as DatabaseImpl;
    const paused = await Effect.runPromise(pausedTasks(db, now));
    expect(paused.map((task) => task.taskId)).toEqual(["t1"]);
  });
});
