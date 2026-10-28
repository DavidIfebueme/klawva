import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

export const RESERVE_RATE = 0.05;
export const RESERVE_FLOOR_MINOR = 2_500_000;
export const TRIPWIRE_RATE = 0.15;
export const COHORT_DAYS = 90;
export const TRIPWIRE_GUARANTEE_HOURS = 24;

export const reserveFor = (commissionMinor: number): number =>
  Math.max(Math.round(commissionMinor * RESERVE_RATE), RESERVE_FLOOR_MINOR);

export const tripwireTripped = (params: {
  readonly platformFundedMinor: number;
  readonly commissionMinor: number;
}): boolean =>
  params.commissionMinor > 0 &&
  params.platformFundedMinor / params.commissionMinor > TRIPWIRE_RATE;

const windowStart = (now: Date): string =>
  new Date(now.getTime() - COHORT_DAYS * 24 * 60 * 60 * 1_000).toISOString();

export const windowSpend = (
  db: DatabaseImpl,
  now: Date,
): Effect.Effect<{ readonly platformFundedMinor: number; readonly commissionMinor: number }> =>
  Effect.gen(function* () {
    const since = windowStart(now);
    const refunds = yield* db
      .first(
        "SELECT COALESCE(SUM(refund_minor),0) AS platformFunded FROM payments WHERE refund_source = 'platform_funded' AND refunded_at IS NOT NULL AND refunded_at >= ?",
        [since],
      )
      .pipe(Effect.orDie);
    const splits = yield* db
      .first(
        "SELECT COALESCE(SUM(commission_minor),0) AS commission FROM payment_splits WHERE created_at >= ?",
        [since],
      )
      .pipe(Effect.orDie);
    return {
      platformFundedMinor: refunds === null ? 0 : Number(refunds.platformFunded),
      commissionMinor: splits === null ? 0 : Number(splits.commission),
    };
  });

export const tripwireActive = (db: DatabaseImpl, now: Date): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const spend = yield* windowSpend(db, now);
    return tripwireTripped(spend);
  });

export const guaranteeHoursForSession = (
  db: DatabaseImpl,
  sessionCreatedAt: string,
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT guarantee_hours AS guaranteeHours FROM refund_policy WHERE effective_at <= ? ORDER BY effective_at DESC LIMIT 1",
        [sessionCreatedAt],
      )
      .pipe(Effect.orDie);
    return row === null ? 72 : Number(row.guaranteeHours);
  });

export const applyTripwire = (db: DatabaseImpl, now: Date): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const active = yield* tripwireActive(db, now);
    if (!active) {
      return false;
    }
    const latest = yield* db
      .first(
        "SELECT guarantee_hours AS guaranteeHours FROM refund_policy WHERE id = 1",
      )
      .pipe(Effect.orDie);
    if (latest !== null && Number(latest.guaranteeHours) <= TRIPWIRE_GUARANTEE_HOURS) {
      return false;
    }
    yield* db
      .run(
        "UPDATE refund_policy SET effective_at = ?, guarantee_hours = ? WHERE id = 1",
        [now.toISOString(), TRIPWIRE_GUARANTEE_HOURS],
      )
      .pipe(Effect.orDie);
    return true;
  });

export const holdUntil = (period: string): string => {
  const [year, month] = period.split("-").map((part) => Number(part));
  const start = Date.UTC(year!, (month ?? 1) - 1, 1);
  return new Date(start + COHORT_DAYS * 24 * 60 * 60 * 1_000).toISOString();
};

export const closeReserveMonth = (
  db: DatabaseImpl,
  period: string,
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
    const spend = yield* windowSpend(db, new Date());
    const tripwire = tripwireTripped(spend);
    yield* db
      .run(
        "INSERT INTO refund_reserve (period, gross_minor, commission_minor, reserve_rate, reserved_minor, held_until, tripwire_reached, platform_funded_minor, window_commission_minor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(period) DO UPDATE SET gross_minor = excluded.gross_minor, commission_minor = excluded.commission_minor, reserved_minor = excluded.reserved_minor, platform_funded_minor = excluded.platform_funded_minor, window_commission_minor = excluded.window_commission_minor, tripwire_reached = excluded.tripwire_reached",
        [
          period,
          grossMinor,
          commissionMinor,
          RESERVE_RATE,
          reservedMinor,
          holdUntil(period),
          tripwire ? 1 : 0,
          spend.platformFundedMinor,
          spend.commissionMinor,
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
        "SELECT held_until AS heldUntil, released_at AS releasedAt FROM refund_reserve WHERE period = ? AND released_at IS NULL",
        [period],
      )
      .pipe(Effect.orDie);
    if (row === null) {
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

export const releaseEligibleCohorts = (
  db: DatabaseImpl,
  openDisputesInCohort: (period: string) => Effect.Effect<number>,
  now: Date = new Date(),
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const pending = yield* db
      .all(
        "SELECT period AS period FROM refund_reserve WHERE released_at IS NULL",
      )
      .pipe(Effect.orDie);
    let released = 0;
    for (const row of pending) {
      const period = String(row.period);
      const disputes = yield* openDisputesInCohort(period);
      const done = yield* releaseCohort(db, period, disputes, now);
      if (done) {
        released += 1;
      }
    }
    return released;
  });
