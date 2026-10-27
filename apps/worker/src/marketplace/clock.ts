import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";

export const CLOCK_TARGET_MINUTES = 20;

const OnboardingStageRow = Schema.Struct({
  listingId: Schema.String,
  authorId: Schema.String,
  stage: Schema.String,
  at: Schema.String,
});

export type OnboardingStage =
  | "card_fetched"
  | "kit_green"
  | "sandbox"
  | "submitted"
  | "reviewed"
  | "first_hire"
  | "first_report"
  | "split_visible";

export const recordStage = (
  db: DatabaseImpl,
  params: {
    readonly listingId: string;
    readonly authorId: string;
    readonly stage: OnboardingStage;
    readonly at: Date;
  },
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO onboarding_stages (id, listing_id, author_id, stage, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(listing_id, stage) DO NOTHING",
      [
        crypto.randomUUID(),
        params.listingId,
        params.authorId,
        params.stage,
        params.at.toISOString(),
      ],
    )
    .pipe(Effect.orDie);

export const stageTimes = (
  db: DatabaseImpl,
  listingId: string,
): Effect.Effect<Partial<Record<OnboardingStage, string>>> =>
  Effect.gen(function* () {
    const rows = yield* db
      .all(
        "SELECT listing_id AS listingId, author_id AS authorId, stage AS stage, at AS at FROM onboarding_stages WHERE listing_id = ?",
        [listingId],
      )
      .pipe(Effect.orDie);
    const stages: Partial<Record<OnboardingStage, string>> = {};
    for (const row of rows) {
      const decoded = Schema.decodeUnknownOption(OnboardingStageRow)(row);
      if (decoded._tag === "Some") {
        stages[decoded.value.stage as OnboardingStage] = decoded.value.at;
      }
    }
    return stages;
  });

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
      "SELECT l.owner_id AS authorId, l.id AS listingId, s.created_at AS startedAt, (SELECT MIN(r.created_at) FROM mission_reports r WHERE r.session_id = s.id) AS reportedAt FROM sessions s JOIN agent_listings l ON l.id = s.listing_id WHERE l.owner_id != 'system' AND s.id NOT IN (SELECT session_id FROM shopper_audits) ORDER BY s.created_at DESC LIMIT ?",
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
