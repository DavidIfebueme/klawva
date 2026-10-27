import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

export const CLOCK_TARGET_MINUTES = 20;

export const timeToFirstReportMinutes = (params: {
  readonly startedAt: string;
  readonly reportedAt: string | null;
}): number | null => {
  if (params.reportedAt === null) {
    return null;
  }
  const start = Date.parse(params.startedAt);
  const end = Date.parse(params.reportedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return Math.round(((end - start) / 60_000) * 10) / 10;
};

export const clockVerdict = (
  minutes: number | null,
): "within" | "over" | "unknown" => {
  if (minutes === null) {
    return "unknown";
  }
  return minutes <= CLOCK_TARGET_MINUTES ? "within" : "over";
};

export const onboardingClock = (
  db: DatabaseImpl,
  limit = 20,
): Effect.Effect<
  ReadonlyArray<{
    readonly authorId: string;
    readonly listingId: string;
    readonly minutes: number | null;
    readonly verdict: string;
  }>
> =>
  db
    .all(
      "SELECT l.owner_id AS authorId, l.id AS listingId, s.created_at AS startedAt, (SELECT MIN(r.created_at) FROM mission_reports r WHERE r.session_id = s.id) AS reportedAt FROM sessions s JOIN agent_listings l ON l.id = s.listing_id WHERE l.owner_id != 'system' ORDER BY s.created_at DESC LIMIT ?",
      [limit],
    )
    .pipe(
      Effect.orDie,
      Effect.map((rows) =>
        rows.map((row) => {
          const minutes = timeToFirstReportMinutes({
            startedAt: String(row.startedAt),
            reportedAt: row.reportedAt === null ? null : String(row.reportedAt),
          });
          return {
            authorId: String(row.authorId),
            listingId: String(row.listingId),
            minutes,
            verdict: clockVerdict(minutes),
          };
        }),
      ),
    );

export const medianMinutes = (
  values: ReadonlyArray<number | null>,
): number | null => {
  const present = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (present.length === 0) {
    return null;
  }
  const middle = Math.floor(present.length / 2);
  return present.length % 2 === 0
    ? Math.round(((present[middle - 1]! + present[middle]!) / 2) * 10) / 10
    : present[middle]!;
};
