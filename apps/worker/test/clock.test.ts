import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../src/db/database.ts";
import { clockVerdict, medianMinutes, timeToFirstReportMinutes } from "../src/marketplace/clock.ts";

const dbOf = (rows: ReadonlyArray<Record<string, unknown>>): DatabaseImpl => ({
  all: () => Effect.succeed(rows as never),
  first: () => Effect.succeed(null),
  run: () => Effect.void,
  batch: () => Effect.void,
  changed: () => Effect.succeed(0),
});

describe("onboarding clock", () => {
  it("measures start to first report in minutes", () => {
    expect(
      timeToFirstReportMinutes({
        startedAt: "2026-10-27T10:00:00Z",
        reportedAt: "2026-10-27T10:17:30Z",
      }),
    ).toBe(17.5);
  });

  it("no report yet is unknown, not zero", () => {
    expect(timeToFirstReportMinutes({ startedAt: "2026-10-27T10:00:00Z", reportedAt: null })).toBeNull();
    expect(clockVerdict(null)).toBe("unknown");
  });

  it("twenty minutes is the line", () => {
    expect(clockVerdict(20)).toBe("within");
    expect(clockVerdict(20.1)).toBe("over");
  });

  it("reports per author from real rows", async () => {
    const { onboardingClock } = await import("../src/marketplace/clock.ts");
    const rows = await Effect.runPromise(
      onboardingClock(
        dbOf([
          {
            authorId: "u1",
            listingId: "l1",
            startedAt: "2026-10-27T10:00:00Z",
            reportedAt: "2026-10-27T10:25:00Z",
          },
        ]),
      ),
    );
    expect(rows[0]?.verdict).toBe("over");
  });

  it("median ignores unknowns", () => {
    expect(medianMinutes([10, null, 20, 30])).toBe(20);
    expect(medianMinutes([null])).toBeNull();
  });
});
