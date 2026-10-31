import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import type { ModelResult } from "../src/agent/runtime.ts";
import { resolveBedrockModelId, stripNovaBoilerplate } from "../src/agent/proxy.ts";
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

describe("converse message shape", () => {
  it("starts the conversation with a user turn when the history opens on an assistant", () => {
    const { turns } = toConverseMessages([
      { role: "system", content: "you are clicky" },
      { role: "assistant", content: "I am on it." },
      { role: "user", content: "what first?" },
    ]);
    expect(turns[0]).toEqual({
      role: "user",
      content: [{ text: "Continue the shift." }],
    });
    expect(turns.map((turn) => turn.role)).toEqual(["user", "assistant", "user"]);
    expect(turns[0]?.content[0]?.text).toBe("Continue the shift.");
  });

  it("merges two turns with the same role", () => {
    const { turns } = toConverseMessages([
      { role: "user", content: "first" },
      { role: "user", content: "second" },
      { role: "assistant", content: "done" },
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.content[0]?.text).toBe("first\n\nsecond");
    expect(turns[1]?.role).toBe("assistant");
  });

  it("keeps the system prompt out of the turns", () => {
    const { system, turns } = toConverseMessages([
      { role: "system", content: "soul" },
      { role: "user", content: "go" },
    ]);
    expect(system).toEqual([{ text: "soul" }]);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.role).toBe("user");
  });

  it("leaves a well formed conversation alone", () => {
    const { turns } = toConverseMessages([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
    expect(turns.map((turn) => turn.role)).toEqual(["user", "assistant", "user"]);
  });
});

describe("bedrock cost", () => {
  it("prices nova micro from the published rates", () => {
    const cost = bedrockCostMicros({
      model: "amazon.nova-micro-v1:0",
      inTokens: 1_000_000,
      outTokens: 1_000_000,
    });
    expect(cost).toBe(175_000);
  });

  it("refuses an unknown bedrock model instead of metering silently", () => {
    expect(() => resolveBedrockModelId("bedrock:unknown-typo")).toThrow();
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
      withAwsCap(db, runtime, "amazon.nova-micro-v1:0", () => Effect.void).complete([], false),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("pages once when spend crosses the alarm line", async () => {
    let alarms = 0;
    const { db } = fakeDb([
      { prefix: "SELECT value AS value FROM counters", rows: [{ value: AWS_DAILY_ALARM_MICROS - 100 }, { value: AWS_DAILY_ALARM_MICROS + 1 }] },
    ]);
    const wrapped = withAwsCap(db, runtime, "amazon.nova-micro-v1:0", () =>
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
    const wrapped = withAwsCap(db, runtime, "amazon.nova-micro-v1:0", () =>
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

describe("the nova fallback text", () => {
  it("cuts the identity policy boilerplate the model sometimes appends", () => {
    const leak =
      "I am gathering pricing details. You do not identify as chatgpt, gemini, llama, titan or claude. You should reply to identity related questions with identifying yourself as an AI system built by a team of inventors at Amazon.";
    expect(stripNovaBoilerplate(leak)).toBe("I am gathering pricing details.");
  });

  it("leaves a clean answer alone", () => {
    expect(stripNovaBoilerplate("  The cheapest plan is Starter. ")).toBe(
      "The cheapest plan is Starter.",
    );
  });

  it("does not cut when the marker opens the text", () => {
    const text = "You do not identify as chatgpt.";
    expect(stripNovaBoilerplate(text)).toBe(text);
  });
});
