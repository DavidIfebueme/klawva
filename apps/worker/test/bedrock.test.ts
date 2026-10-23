import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import type { ModelResult } from "../src/agent/runtime.ts";
import {
  AWS_DAILY_ALARM_MICROS,
  AWS_DAILY_CAP_MICROS,
  bedrockCostMicros,
  makeBedrockRuntime,
  measureMigrationTrigger,
  toConverseMessages,
  toolConfigFor,
  withAwsCap,
} from "../src/agent/bedrock.ts";

const fakeDb = (
  rowsByPrefix: Array<{ prefix: string; rows: Array<Row | null> }> = [],
): { db: DatabaseImpl; writes: Array<{ sql: string; params: ReadonlyArray<Param> }> } => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const db: DatabaseImpl = {
    all: (sql) => {
      const hit = rowsByPrefix.find((entry) => sql.startsWith(entry.prefix));
      const rows = hit?.rows ?? [];
      return Effect.succeed(rows.filter((row): row is Row => row !== null));
    },
    first: (sql) => {
      const hit = rowsByPrefix.find((entry) => sql.startsWith(entry.prefix));
      if (hit === undefined) {
        return Effect.succeed(null);
      }
      const queue = [...hit.rows];
      const row = queue.length > 1 ? queue.shift()! : queue[0];
      hit.rows = queue;
      return Effect.succeed(row ?? null);
    },
    run: (sql, params) => {
      writes.push({ sql, params: params ?? [] });
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  };
  return { db, writes };
};

describe("bedrock cost", () => {
  it("prices nova micro from the published rates", () => {
    const cost = bedrockCostMicros({
      model: "amazon.nova-micro-v1:0",
      inTokens: 1_000_000,
      outTokens: 1_000_000,
    });
    expect(cost).toBe(175_000);
  });

  it("returns null for an unknown model so it never silently bills", () => {
    expect(
      bedrockCostMicros({ model: "unknown", inTokens: 1, outTokens: 1 }),
    ).toBeNull();
  });
});

describe("converse mapping", () => {
  it("moves the system message out of the turn list", () => {
    const { system, turns } = toConverseMessages([
      { role: "system", content: "you are ada" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "tool", content: "page contents" },
    ]);
    expect(system).toEqual([{ text: "you are ada" }]);
    expect(turns.length).toBe(3);
    expect(turns.every((turn) => (turn.role === "user" || turn.role === "assistant"))).toBe(true);
  });

  it("shapes tools for converse toolConfig", () => {
    const config = toolConfigFor([
      { name: "fetch_url", description: "fetch", parameters: { type: "object" } },
    ]);
    expect(config.toolConfig?.tools[0]?.toolSpec.name).toBe("fetch_url");
    expect(toolConfigFor([])).toEqual({});
  });
});

describe("bearer path", () => {
  it("prefers the api key bearer over sigv4 when the key is set", async () => {
    const seen: Array<string> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(headers.get("Authorization") ?? "");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            output: { message: { role: "assistant", content: [{ text: "ok" }] } },
            usage: { inputTokens: 1, outputTokens: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    };
    try {
      const runtime = makeBedrockRuntime(
        { apiKey: "ABS-test", region: "us-east-1", model: "amazon.nova-micro-v1:0" },
        [],
      );
      const result = await Effect.runPromise(runtime.complete([{ role: "user", content: "hi" }], false));
      expect(result.text).toBe("ok");
      expect(seen).toEqual(["Bearer ABS-test"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("aws cap", () => {
  const result: ModelResult = {
    text: "ok",
    toolCalls: [],
    usage: { inTokens: 1000, outTokens: 1000 },
  };
  const runtime = { complete: () => Effect.succeed(result) };

  it("throttles at the hard cap instead of failing silently", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT value AS value FROM counters", rows: [{ value: AWS_DAILY_CAP_MICROS }] },
    ]);
    const exit = await Effect.runPromiseExit(
      withAwsCap(db, runtime, () => Effect.void).complete([], false),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("pages once when spend crosses the alarm line", async () => {
    let alarms = 0;
    const { db } = fakeDb([
      { prefix: "SELECT value AS value FROM counters", rows: [{ value: AWS_DAILY_ALARM_MICROS - 100 }, { value: AWS_DAILY_ALARM_MICROS + 1 }] },
    ]);
    const wrapped = withAwsCap(db, runtime, () =>
      Effect.sync(() => {
        alarms += 1;
      }),
    );
    await Effect.runPromise(wrapped.complete([], false));
    expect(alarms).toBe(1);
  });

  it("does not page when the alarm was already crossed", async () => {
    let alarms = 0;
    const { db } = fakeDb([
      { prefix: "SELECT value AS value FROM counters", rows: [{ value: AWS_DAILY_ALARM_MICROS + 1 }] },
    ]);
    const wrapped = withAwsCap(db, runtime, () =>
      Effect.sync(() => {
        alarms += 1;
      }),
    );
    await Effect.runPromise(wrapped.complete([], false));
    expect(alarms).toBe(0);
  });
});

describe("migration trigger", () => {
  it("alerts at 70 percent and migrates only on a hot streak or a heavy hire", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT value AS value FROM counters WHERE key = ?", rows: [null] },
      { prefix: "SELECT MAX(spent_minor)", rows: [{ maxSpent: 0 }] },
    ]);
    const first = await Effect.runPromise(measureMigrationTrigger(db, 6300, 9000));
    expect(first.shouldAlert).toBe(true);
    expect(first.hotStreakDays).toBe(1);
    expect(first.shouldMigrate).toBe(false);
  });

  it("migrates when a single hire passes 100 turns in a day", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT value AS value FROM counters WHERE key = ?", rows: [null] },
      { prefix: "SELECT MAX(spent_minor)", rows: [{ maxSpent: 5100 }] },
    ]);
    const measured = await Effect.runPromise(measureMigrationTrigger(db, 100, 9000));
    expect(measured.maxTurnsSingleHire).toBe(102);
    expect(measured.shouldMigrate).toBe(true);
  });
});
