import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { DatabaseError } from "../src/db/database.ts";
import type { DatabaseImpl } from "../src/db/database.ts";
import { estimateNeurons, recordAiUsage } from "../src/agent/meter.ts";

const glm = "@cf/zai-org/glm-4.7-flash";

describe("estimateNeurons", () => {
  it.each([
    { inChars: 4000000, outChars: 0, expected: 5500 },
    { inChars: 0, outChars: 4000000, expected: 36400 },
    { inChars: 0, outChars: 0, expected: 0 },
  ])(
    "estimates $inChars in-chars and $outChars out-chars as $expected neurons",
    ({ inChars, outChars, expected }) => {
      expect(estimateNeurons({ model: glm, inChars, outChars })).toBe(expected);
    },
  );

  it("combines input and output", () => {
    expect(
      estimateNeurons({ model: glm, inChars: 4000, outChars: 4000 }),
    ).toBeCloseTo(41.9);
  });

  it("returns null for an unknown model", () => {
    expect(
      estimateNeurons({ model: "unknown-model", inChars: 4000, outChars: 4 }),
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
      run: (_sql, params) => {
        if (fail) {
          return Effect.fail(
            new DatabaseError({ operation: "test", cause: "boom" }),
          );
        }
        writes.push({ key: params?.[0], by: params?.[1] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(1),
    },
    writes,
  };
};

describe("recordAiUsage", () => {
  it("increments calls and char counters for the model and day", async () => {
    const { db, writes } = captureDb(false);
    await Effect.runPromise(
      recordAiUsage(db, { model: glm, inChars: 100, outChars: 50, ok: true }),
    );
    const day = new Date().toISOString().slice(0, 10);
    expect(writes).toContainEqual({ key: `ai:calls:${day}:${glm}`, by: 1 });
    expect(writes).toContainEqual({
      key: `ai:in-chars:${day}:${glm}`,
      by: 100,
    });
    expect(writes).toContainEqual({
      key: `ai:out-chars:${day}:${glm}`,
      by: 50,
    });
    expect(
      writes.some((w) => String(w.key).includes("ai:errors:")),
    ).toBe(false);
  });

  it("increments the error counter on failure", async () => {
    const { db, writes } = captureDb(false);
    await Effect.runPromise(
      recordAiUsage(db, { model: glm, inChars: 100, outChars: 0, ok: false }),
    );
    const day = new Date().toISOString().slice(0, 10);
    expect(writes).toContainEqual({
      key: `ai:errors:${day}:${glm}`,
      by: 1,
    });
  });

  it("never fails the caller when the database is down", async () => {
    const { db } = captureDb(true);
    await Effect.runPromise(
      recordAiUsage(db, { model: glm, inChars: 100, outChars: 50, ok: true }),
    );
  });
});
