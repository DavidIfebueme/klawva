import { describe, expect, it, vi } from "vitest";
import { dohResponse, withDoh } from "./doh.ts";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import { deterministicTaskId, dispatchTask, parseSse } from "../src/hosted/dispatch.ts";
import type { Manifest } from "../src/db/schema.ts";

const taskRow: Row | null = null;

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

const manifest = {
  soul: "x",
  runtime: {
    kind: "hosted",
    billing: "author-metered",
    transport: ["web"],
    hosted: { mode: "push", cardUrl: "https://author.example/.well-known/agent-card.json" },
  },
  report: { requireEvidence: true, minEvidence: 1 },
} as unknown as Manifest;

const input = {
  sessionId: "s1",
  listingId: "l1",
  listingVersion: 1,
  manifest,
  brief: { task: "do it" },
  briefHash: "abc",
};

const cardBody = JSON.stringify({ name: "cellar", version: "1.0.0" });

const okDeps = (sse: string) => ({
  fetchText: withDoh((url: string) =>
    url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("agent-card")
      ? new Response(cardBody, { status: 200 })
      : new Response(sse, { status: 200 }),
  ),
});

describe("dispatch", () => {
  it("derives the task id from session and version", async () => {
    const a = await deterministicTaskId("s1", 1);
    const b = await deterministicTaskId("s1", 2);
    expect(a).toMatch(/^tsk_[a-z2-7]{26}$/);
    expect(a).not.toBe(b);
    expect(await deterministicTaskId("s1", 1)).toBe(a);
  });

  it("inserts one task row and writes the streamed frames", async () => {
    const { db, writes } = fakeDb();
    const sse = [
      'event: task',
      'data: {"task":{"id":"r1","status":{"state":"TASK_STATE_WORKING"}}}',
      "",
      'event: artifact',
      'data: {"artifactUpdate":{"artifact":{"parts":[{"text":"{\\"outcome\\":\\"complete\\",\\"summary\\":\\"done\\"}"}]}}}',
      "",
    ].join("\n");
    const deps = okDeps(sse);
    const result = await Effect.runPromise(dispatchTask(db, input, deps));
    expect(result.replay).toBe(false);
    const inserts = writes.filter((w) => w.sql.includes("INSERT INTO session_tasks"));
    expect(inserts.length).toBe(1);
    const events = writes.filter((w) => w.sql.includes("INSERT INTO task_events"));
    expect(events.length).toBe(2);


  });

  it("is a replay when a task row already exists", async () => {
    const existing = await deterministicTaskId("s1", 1);
    const { db } = fakeDb([
      {
        prefix: "SELECT id AS id, state AS state FROM session_tasks",
        row: { id: existing, state: "working" },
      },
    ]);
    const deps = okDeps("");
    const result = await Effect.runPromise(dispatchTask(db, input, deps));
    expect(result.replay).toBe(true);
    expect(deps.fetchText).not.toHaveBeenCalled();
  });

  it("fails on a card that does not parse as an agent card", async () => {
    const { db, writes } = fakeDb();
    const deps = {
      fetchText: withDoh(async () => new Response("not json", { status: 200 })),
    };
    await expect(
      Effect.runPromise(dispatchTask(db, input, deps)),
    ).rejects.toBeDefined();
    const fail = writes.find(
      (w) => w.sql.includes("state = 'failed'") && w.sql.includes("card_shape"),
    );
    expect(fail).toBeDefined();
  });
});

describe("sse parsing", () => {
  it("keeps event names and joins multi-line data", () => {
    const frames = parseSse("event: task\ndata: a\ndata: b\n\ndata: c\n");
    expect(frames).toEqual([
      { event: "task", data: "a\nb" },
      { event: "message", data: "c" },
    ]);
  });
});

describe("hosted lane flag", () => {
  it("counts only the exact string true, matching the house env semantics", async () => {
    const { hostedEnabled } = await import("../src/hosted/dispatch.ts");
    expect(hostedEnabled("true")).toBe(true);
    expect(hostedEnabled("1")).toBe(false);
    expect(hostedEnabled(undefined)).toBe(false);
  });
});

describe("brief and post safety", () => {
  it("a posted redirect into a private address fails the task instead of being followed", async () => {
    const { db, writes } = fakeDb();
    const deps = {
      fetchText: withDoh((url: string) =>
        url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("agent-card")
          ? new Response(JSON.stringify({ name: "a" }), { status: 200 })
          : new Response(null, { status: 307, headers: { location: "http://10.0.0.5/x" } }),
      ),
    };
    const exit = await Effect.runPromiseExit(
      dispatchTask(
        db,
        { ...input, sessionId: "s-post" },
        deps,
      ),
    );
    expect(exit._tag).toBe("Failure");
    expect(writes.some((w) => w.sql.includes("state = 'failed'"))).toBe(true);
  });

  it("the brief sent to the author is the parsed record, not empty", async () => {
    const { db } = fakeDb();
    const sent: string[] = [];
    const deps = {
      fetchText: withDoh((url: string, init?: RequestInit) => {
        if (url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("agent-card")) {
          return new Response(JSON.stringify({ name: "a" }), { status: 200 });
        }
        sent.push(String(init?.body ?? ""));
        return new Response("", { status: 200 });
      }),
    };
    await Effect.runPromise(
      dispatchTask(db, { ...input, sessionId: "s-brief", brief: { task: "do the thing" } }, deps),
    );
    expect(sent[0]).toContain("do the thing");
  });
});

describe("cancel stops the stream", () => {
  it("a cancelled task is marked cancelled and no later frame is processed", async () => {
    const { db, writes } = fakeDb([
      {
        prefix: "SELECT cancel_requested_at AS requestedAt",
        row: { requestedAt: new Date().toISOString() },
      },
    ]);
    const sse = [
      'event: task',
      'data: {"task":{"id":"r1"}}',
      "",
      'event: artifact',
      'data: {"artifactUpdate":{"artifact":{"parts":[{"text":"{\\"outcome\\":\\"complete\\",\\"summary\\":\\"late\\"}"}]}}}',
      "",
    ].join("\n");
    const deps = {
      fetchText: withDoh((url: string) =>
        url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("agent-card")
          ? new Response(JSON.stringify({ name: "a" }), { status: 200 })
          : new Response(sse, { status: 200 }),
      ),
    };
    const result = await Effect.runPromise(
      dispatchTask(db, { ...input, sessionId: "s-cancel" }, deps),
    );
    expect(result.state).toBe("cancelled");
    expect(writes.some((w) => w.sql.includes("state = 'cancelled'"))).toBe(true);
    expect(writes.some((w) => w.sql.includes("INSERT INTO mission_reports"))).toBe(false);
  });
});
