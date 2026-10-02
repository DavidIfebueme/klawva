import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { canSpend, canTransition, transition } from "../src/session/agent.ts";

describe("session state", () => {
  it("allows the happy path and forbids illegal moves", () => {
    expect(canTransition("pending", "active")).toBe(false);
    expect(canTransition("provisioning", "active")).toBe(true);
    expect(canTransition("active", "completed")).toBe(true);
    expect(canTransition("completed", "active")).toBe(false);
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
