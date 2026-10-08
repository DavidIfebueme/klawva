import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { DatabaseError } from "../src/db/database.ts";
import type { DatabaseImpl } from "../src/db/database.ts";
import {
  charsToTokens,
  checkNeuronBudget,
  dayNeurons,
  estimateNeurons,
  recordAiUsage,
} from "../src/agent/meter.ts";

const glm = "@cf/zai-org/glm-4.7-flash";
const day = new Date().toISOString().slice(0, 10);

describe("charsToTokens", () => {
  it("rounds up at four characters per token", () => {
    expect(charsToTokens(0)).toBe(0);
    expect(charsToTokens(1)).toBe(1);
    expect(charsToTokens(4)).toBe(1);
    expect(charsToTokens(5)).toBe(2);
  });
});

describe("estimateNeurons", () => {
  it.each([
    { inTokens: 1_000_000, outTokens: 0, expected: 5500 },
    { inTokens: 0, outTokens: 1_000_000, expected: 36400 },
    { inTokens: 0, outTokens: 0, expected: 0 },
  ])(
    "estimates $inTokens in and $outTokens out as $expected neurons",
    ({ inTokens, outTokens, expected }) => {
      expect(estimateNeurons({ model: glm, inTokens, outTokens })).toBe(expected);
    },
  );

  it("returns null for an unknown model", () => {
    expect(
      estimateNeurons({ model: "unknown-model", inTokens: 100, outTokens: 4 }),
    ).toBeNull();
  });
});

const captureDb = (fail: boolean): {
  db: DatabaseImpl;
  writes: Array<{ key: unknown; by: unknown }>;
} => {
  const writes: Array<{ key: unknown; by: unknown }> = [];
  return {
    db: {
      all: () => Effect.succeed([]),
      first: () => Effect.succeed(null),
      run: () => Effect.void,
      batch: (statements) => {
        if (fail) {
          return Effect.fail(
            new DatabaseError({ operation: "test", cause: "boom" }),
          );
        }
        for (const statement of statements) {
          writes.push({
            key: statement.params?.[0],
            by: statement.params?.[1],
          });
        }
        return Effect.void;
      },
      changed: () => Effect.succeed(1),
    },
    writes,
  };
};

describe("recordAiUsage", () => {
  it("increments calls and token counters for the model and day", async () => {
    const { db, writes } = captureDb(false);
    await Effect.runPromise(
      recordAiUsage(db, {
        model: glm,
        inTokens: 100,
        outTokens: 50,
        ok: true,
      }),
    );
    expect(writes).toContainEqual({ key: `ai:calls:${day}:${glm}`, by: 1 });
    expect(writes).toContainEqual({
      key: `ai:in-tokens:${day}:${glm}`,
      by: 100,
    });
    expect(writes).toContainEqual({
      key: `ai:out-tokens:${day}:${glm}`,
      by: 50,
    });
    expect(writes.some((w) => String(w.key).includes("ai:errors:"))).toBe(false);
  });

  it("increments the error counter on failure", async () => {
    const { db, writes } = captureDb(false);
    await Effect.runPromise(
      recordAiUsage(db, {
        model: glm,
        inTokens: 100,
        outTokens: 0,
        ok: false,
      }),
    );
    expect(writes).toContainEqual({ key: `ai:errors:${day}:${glm}`, by: 1 });
  });

  it("never fails the caller when the database is down", async () => {
    const { db } = captureDb(true);
    await Effect.runPromise(
      recordAiUsage(db, {
        model: glm,
        inTokens: 100,
        outTokens: 50,
        ok: true,
      }),
    );
  });
});

const rowsDb = (
  rows: ReadonlyArray<{ key: string; value: number }>,
): DatabaseImpl => ({
  all: () => Effect.succeed(rows),
  first: () => Effect.succeed(null),
  run: () => Effect.void,
  batch: () => Effect.void,
  changed: () => Effect.succeed(1),
});

describe("dayNeurons", () => {
  it("sums estimates across models for the day", async () => {
    const db = rowsDb([
      { key: `ai:in-tokens:${day}:${glm}`, value: 1_000_000 },
      { key: `ai:out-tokens:${day}:${glm}`, value: 0 },
    ]);
    expect(await Effect.runPromise(dayNeurons(db, day))).toBe(5500);
  });

  it("ignores other days, unknown models, and unrelated counters", async () => {
    const db = rowsDb([
      { key: `ai:in-tokens:2000-01-01:${glm}`, value: 40_000_000 },
      { key: `ai:in-tokens:${day}:unknown-model`, value: 40_000_000 },
      { key: "turns:2026-01-01", value: 5000 },
    ]);
    expect(await Effect.runPromise(dayNeurons(db, day))).toBe(0);
  });

  it("counts every step of a multi step turn", async () => {
    const db = rowsDb([
      { key: `ai:in-tokens:${day}:${glm}`, value: 1_000_000 },
      { key: `ai:out-tokens:${day}:${glm}`, value: 1_000_000 },
    ]);
    expect(await Effect.runPromise(dayNeurons(db, day))).toBe(41900);
  });
});

describe("checkNeuronBudget", () => {
  it("admits when usage is under the cap", async () => {
    expect(await Effect.runPromise(checkNeuronBudget(rowsDb([])))).toBe(true);
  });

  it("refuses when usage reaches the cap", async () => {
    const db = rowsDb([
      { key: `ai:in-tokens:${day}:${glm}`, value: 2_000_000 },
    ]);
    expect(await Effect.runPromise(checkNeuronBudget(db))).toBe(false);
  });
});
