import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { decideScope, isInScope } from "../src/moderation/clef.ts";
import { admitTurn } from "../src/session/agent.ts";
import type { SessionStoreImpl } from "../src/session/agent.ts";
import type { DatabaseImpl } from "../src/db/database.ts";

const clefOutput = (score: number) => ({
  answers: { in_scope: { type: "noul", noul: score } },
  usage: { input_tokens: 175 },
});

const fakeAi = (score: number): Ai =>
  ({
    run: () => Promise.resolve(clefOutput(score)),
  }) as unknown as Ai;

const failingAi = (): Ai =>
  ({
    run: () => Promise.reject(new Error("clef down")),
  }) as unknown as Ai;

const store = (meta: Readonly<Record<string, string>>): SessionStoreImpl => ({
  get: (key) => Effect.succeed(meta[key] ?? null),
  set: () => Effect.void,
  append: () => Effect.void,
  history: () => Effect.succeed([]),
  spend: () => Effect.void,
});

const db: DatabaseImpl = {
  all: () => Effect.succeed([]),
  first: () => Effect.succeed({ value: "0" }),
  run: () => Effect.void,
  changed: () => Effect.succeed(1),
  batch: () => Effect.void,
};

const brief = JSON.stringify({ task: "find iphone duo prices in lagos" });
const activeMeta = { brief, state: "active" };

describe("clef scope decoding", () => {
  it("decodes the answers envelope and reads the noul probability", async () => {
    const out = await Effect.runPromise(
      decideScope(fakeAi(0.9), { task: "x" }, "on task"),
    );
    expect(out.answers.in_scope.noul).toBe(0.9);
    expect(isInScope(out)).toBe(true);
  });

  it("treats a probability below the threshold as out of scope", async () => {
    const out = await Effect.runPromise(
      decideScope(fakeAi(0.0187), { task: "x" }, "unrelated"),
    );
    expect(isInScope(out)).toBe(false);
  });

  it("fails with ClefError when the response does not match the schema", async () => {
    const bad = {
      run: () => Promise.resolve({ unexpected: true }),
    } as unknown as Ai;
    const exit = await Effect.runPromiseExit(
      decideScope(bad, { task: "x" }, "hi"),
    );
    expect(exit._tag).toBe("Failure");
  });
});

describe("clef scope gate in admitTurn", () => {
  it("rejects a semantically off-scope message the regex admits", async () => {
    const admission = await Effect.runPromise(
      admitTurn(store(activeMeta), db, "s1", "what is the weather in paris", fakeAi(0.02)),
    );
    expect(admission._tag).toBe("Rejected");
  });

  it("admits a semantically in-scope message", async () => {
    const admission = await Effect.runPromise(
      admitTurn(store(activeMeta), db, "s1", "find the cheapest iphone duo listing", fakeAi(0.91)),
    );
    expect(admission._tag).toBe("Admitted");
  });

  it("falls back to the regex verdict when clef is down", async () => {
    const admission = await Effect.runPromise(
      admitTurn(store(activeMeta), db, "s1", "find the cheapest iphone duo listing", failingAi()),
    );
    expect(admission._tag).toBe("Admitted");
  });

  it("admits when no ai binding is provided", async () => {
    const admission = await Effect.runPromise(
      admitTurn(store(activeMeta), db, "s1", "find the cheapest iphone duo listing"),
    );
    expect(admission._tag).toBe("Admitted");
  });
});
