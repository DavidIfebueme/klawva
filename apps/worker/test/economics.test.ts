import { describe, expect, it } from "vitest";
import { corridorBlocked, corridors, lastPeriod, pspFeeFor, unitEconomics } from "../src/payments/economics.ts";

describe("unit economics", () => {
  it("shows a healthy domestic case", () => {
    const row = unitEconomics({ label: "domestic", grossMinor: 1_500_000, commissionRate: 0.2, whtRate: 0, international: false });
    expect(row.negative).toBe(false);
    expect(row.commissionMinor).toBe(300_000);
    expect(row.authorNetMinor).toBe(1_200_000);
  });

  it("blocks an international corridor on a cheap listing, which is the point", () => {
    const rows = corridors(100_000);
    expect(corridorBlocked(rows)).toContain("non-resident");
  });

  it("a healthy international case is not blocked", () => {
    const rows = corridors(100_000_000);
    expect(corridorBlocked(rows)).toEqual([]);
  });

  it("psp fees follow the documented bands", () => {
    expect(pspFeeFor(1_000, false)).toBe(1_000);
    expect(pspFeeFor(10_000, false)).toBe(2_500);
    expect(pspFeeFor(100_000, false)).toBe(5_000);
    expect(pspFeeFor(100_000, true)).toBe(6_000_000);
  });

  it("period is always the previous month", () => {
    expect(lastPeriod(new Date("2026-11-15T00:00:00Z"))).toBe("2026-10");
    expect(lastPeriod(new Date("2026-01-05T00:00:00Z"))).toBe("2025-12");
  });
});
