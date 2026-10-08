import { describe, expect, it } from "vitest";
import {
  discountFor,
  durationOptions,
  isSupportedDuration,
  priceForDays,
  windowEndFor,
} from "../src/payments/pricing.ts";

describe("duration options", () => {
  it("accepts only the offered durations", () => {
    for (const days of durationOptions) {
      expect(isSupportedDuration(days)).toBe(true);
    }
    expect(isSupportedDuration(0)).toBe(false);
    expect(isSupportedDuration(3)).toBe(false);
    expect(isSupportedDuration(365)).toBe(false);
  });

  it("discounts grow with the commitment", () => {
    expect(discountFor(1)).toBe(0);
    expect(discountFor(2)).toBeGreaterThan(0);
    expect(discountFor(7)).toBeGreaterThan(discountFor(2));
    expect(discountFor(30)).toBeGreaterThan(discountFor(7));
  });
});

describe("priceForDays", () => {
  it("charges the unit price for one day", () => {
    expect(priceForDays(250000, 1)).toBe(250000);
  });

  it("applies the discount for a longer commitment", () => {
    expect(priceForDays(250000, 2)).toBe(475000);
    expect(priceForDays(250000, 7)).toBe(1487500);
    expect(priceForDays(250000, 30)).toBe(5625000);
  });

  it("stays cheaper per day as the duration grows", () => {
    const one = (priceForDays(250000, 1) ?? 0) / 1;
    const thirty = (priceForDays(250000, 30) ?? 0) / 30;
    expect(thirty).toBeLessThan(one);
  });

  it("rejects a duration that is not offered", () => {
    expect(priceForDays(250000, 3)).toBeNull();
  });

  it("rounds to whole naira", () => {
    const price = priceForDays(100000, 7);
    expect(price).not.toBeNull();
    expect((price ?? 0) % 100).toBe(0);
  });
});

describe("windowEndFor", () => {
  it("adds the requested number of days", () => {
    const start = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(windowEndFor(start, 1)).toBe(new Date(start + 86400000).toISOString());
    expect(windowEndFor(start, 7)).toBe(
      new Date(start + 7 * 86400000).toISOString(),
    );
    expect(windowEndFor(start, 30)).toBe(
      new Date(start + 30 * 86400000).toISOString(),
    );
  });

  it("never returns a window shorter than a day", () => {
    const start = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(windowEndFor(start, 0)).toBe(new Date(start + 86400000).toISOString());
  });
});
