import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param } from "../src/db/database.ts";
import { sessionTransitions, terminalSessionStates } from "../src/db/schema.ts";
import type { SessionStoreImpl } from "../src/session/agent.ts";
import {
  canSpend,
  canTransition,
  projectState,
  transition,
} from "../src/session/agent.ts";

describe("session state", () => {
  it("allows the happy path and forbids illegal moves", () => {
    expect(canTransition("pending", "active")).toBe(true);
    expect(canTransition("pending", "expired")).toBe(true);
    expect(canTransition("active", "completed")).toBe(true);
    expect(canTransition("hibernating", "active")).toBe(true);
    expect(canTransition("completed", "active")).toBe(false);
    expect(canTransition("expired", "active")).toBe(false);
    expect(canTransition("active", "expired")).toBe(false);
  });

  it("keeps every terminal state closed", () => {
    for (const state of terminalSessionStates) {
      expect(sessionTransitions[state]).toEqual([]);
    }
  });

  it("lists every closed state as terminal", () => {
    const closed: ReadonlyArray<string> = Object.entries(sessionTransitions)
      .filter(([, next]) => next.length === 0)
      .map(([state]) => state);
    expect([...closed].sort()).toEqual([...terminalSessionStates].sort());
  });

  it("fails an illegal transition with a typed error", () => {
    const exit = Effect.runSyncExit(transition("completed", "active"));
    expect(exit._tag).toBe("Failure");
  });

  it("enforces the budget cap", () => {
    expect(canSpend(100, 0, 100)).toBe(true);
    expect(canSpend(100, 90, 20)).toBe(false);
  });
});

describe("session projection", () => {
  it("writes the state and the shift window to d1", async () => {
    const meta: Readonly<Record<string, string>> = {
      window_start: "2026-01-01T00:00:00.000Z",
      window_end: "2026-01-02T00:00:00.000Z",
    };
    const store: SessionStoreImpl = {
      get: (key) => Effect.succeed(meta[key] ?? null),
      set: () => Effect.void,
      append: () => Effect.void,
      history: () => Effect.succeed([]),
      spend: () => Effect.succeed(undefined),
    };
    const writes: Array<{
      readonly sql: string;
      readonly params: ReadonlyArray<Param>;
    }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([]),
      first: () => Effect.succeed(null),
      run: (sql, params) => {
        writes.push({ sql, params: params ?? [] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };

    await Effect.runPromise(projectState(store, db, "s1", "completed"));

    const [write] = writes;
    expect(writes.length).toBe(1);
    expect(write.sql).toContain("state = ?");
    expect(write.sql).toContain("window_start = ?");
    expect(write.sql).toContain("window_end = ?");
    expect(write.params).toEqual([
      "completed",
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
      expect.any(String),
      "s1",
    ]);
  });
});
