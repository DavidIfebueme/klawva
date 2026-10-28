import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { cadenceFor, jitteredMinuteOfDay, neverTwoInARow, shouldShopToday } from "../src/marketplace/shopper.ts";

describe("shopper cadence", () => {
  it("hosted listings are shopped weekly for the first month", () => {
    expect(cadenceFor({ lane: "hosted", listingAgeDays: 5, topVolume: false })).toEqual({
      due: true,
      everyDays: 7,
    });
  });

  it("after the first month it is monthly", () => {
    expect(cadenceFor({ lane: "hosted", listingAgeDays: 90, topVolume: false }).everyDays).toBe(30);
  });

  it("desktop is only top volume, monthly", () => {
    expect(cadenceFor({ lane: "desktop", listingAgeDays: 90, topVolume: false }).due).toBe(false);
    expect(cadenceFor({ lane: "desktop", listingAgeDays: 90, topVolume: true }).due).toBe(true);
  });

  it("never shops the same listing twice within three days", () => {
    const base = { listingId: "l1", today: "2026-10-27T00:00:00Z", everyDays: 7 };
    expect(shouldShopToday({ ...base, lastShoppedAt: "2026-10-26T00:00:00Z" })).toBe(false);
    expect(shouldShopToday({ ...base, lastShoppedAt: "2026-10-01T00:00:00Z" })).toBe(true);
    expect(shouldShopToday({ ...base, lastShoppedAt: null })).toBe(true);
  });

  it("jitter is deterministic per listing and day, and spread across the day", () => {
    const a = jitteredMinuteOfDay("l1", "2026-10-27");
    expect(a).toBe(jitteredMinuteOfDay("l1", "2026-10-27"));
    expect(a).not.toBe(jitteredMinuteOfDay("l2", "2026-10-27"));
    expect(a).toBeLessThan(24 * 60);
  });

  it("never runs two shoppers on one author back to back", () => {
    expect(neverTwoInARow("u1", "u1")).toBe(false);
    expect(neverTwoInARow("u1", "u2")).toBe(true);
  });
});

describe("scheduler decision", () => {
  it("does not shop when the lane says no", async () => {
    const { nextShopperRun } = await import("../src/marketplace/shopper.ts");
    const db = {
      all: () => Effect.succeed([]),
      first: () => Effect.succeed(null),
      run: () => Effect.void,
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    } as const;
    const decision = await Effect.runPromise(
      nextShopperRun(db as never, {
        listingId: "l1",
        lane: "desktop",
        listingAgeDays: 60,
        topVolume: false,
      }),
    );
    expect(decision.run).toBe(false);
    expect(decision.reason).toBe("cadence_not_due");
  });
});
