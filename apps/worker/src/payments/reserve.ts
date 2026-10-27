import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

export const RESERVE_RATE = 0.05;
export const RESERVE_FLOOR_MINOR = 2_500_000;
export const TRIPWIRE_RATE = 0.15;
export const COHORT_DAYS = 90;

export const reserveFor = (commissionMinor: number): number =>
  Math.max(Math.round(commissionMinor * RESERVE_RATE), RESERVE_FLOOR_MINOR);

export const tripwireTripped = (params: {
  readonly platformFundedMinor: number;
  readonly commissionMinor: number;
}): boolean =>
  params.commissionMinor > 0 &&
  params.platformFundedMinor / params.commissionMinor > TRIPWIRE_RATE;

export const holdUntil = (period: string): string => {
  const [year, month] = period.split("-").map((part) => Number(part));
  const start = Date.UTC(year!, (month ?? 1) - 1, 1);
  return new Date(start + COHORT_DAYS * 24 * 60 * 60 * 1_000).toISOString();
};

export const closeReserveMonth = (
  db: DatabaseImpl,
  period: string,
  platformFundedMinor: number,
): Effect.Effect<{ reservedMinor: number; tripwire: boolean }> =>
  Effect.gen(function* () {
    const totals = yield* db
      .first(
        "SELECT COALESCE(SUM(gross_minor),0) AS grossMinor, COALESCE(SUM(commission_minor),0) AS commissionMinor FROM payment_splits WHERE substr(created_at, 1, 7) = ?",
        [period],
      )
      .pipe(Effect.orDie);
    const grossMinor = totals === null ? 0 : Number(totals.grossMinor);
    const commissionMinor = totals === null ? 0 : Number(totals.commissionMinor);
    const reservedMinor = reserveFor(commissionMinor);
    const tripwire = tripwireTripped({ platformFundedMinor, commissionMinor });
    yield* db
      .run(
        "INSERT INTO refund_reserve (period, gross_minor, commission_minor, reserve_rate, reserved_minor, held_until, tripwire_reached) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(period) DO NOTHING",
        [
          period,
          grossMinor,
          commissionMinor,
          RESERVE_RATE,
          reservedMinor,
          holdUntil(period),
          tripwire ? 1 : 0,
        ],
      )
      .pipe(Effect.orDie);
    return { reservedMinor, tripwire };
  });

export const releaseCohort = (
  db: DatabaseImpl,
  period: string,
  openDisputesInCohort: number,
  now: Date = new Date(),
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT held_until AS heldUntil, released_at AS releasedAt FROM refund_reserve WHERE period = ?",
        [period],
      )
      .pipe(Effect.orDie);
    if (row === null || row.releasedAt !== null) {
      return false;
    }
    if (openDisputesInCohort > 0) {
      return false;
    }
    if (Date.parse(String(row.heldUntil)) > now.getTime()) {
      return false;
    }
    yield* db
      .run("UPDATE refund_reserve SET released_at = ? WHERE period = ?", [
        now.toISOString(),
        period,
      ])
      .pipe(Effect.orDie);
    return true;
  });
