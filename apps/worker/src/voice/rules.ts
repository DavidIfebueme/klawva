import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import type { LaunchMarket } from "../db/schema.ts";

export type Market = LaunchMarket;

const quietWindowsUtc: Record<Market, { startHour: number; endHour: number }> = {
  us: { startHour: 13, endHour: 25 },
  in: { startHour: 2, endHour: 14 },
  ng: { startHour: 7, endHour: 19 },
};

export const insideCallingWindow = (market: Market, at: Date): boolean => {
  const window = quietWindowsUtc[market];
  const hour = at.getUTCHours() + at.getUTCMinutes() / 60;
  const start = window.startHour;
  const end = window.endHour;
  if (end <= 24) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end - 24;
};

export const aiDisclosureLine =
  "This call is from an AI employee on behalf of the business you are hearing from. It is transcribed, not recorded.";

export interface ConsentStatus {
  readonly consented: boolean;
  readonly onDnc: boolean;
}

export const consentFor = (
  db: DatabaseImpl,
  number: string,
): Effect.Effect<ConsentStatus> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT consent_source AS consentSource, consented_at AS consentedAt, dnc AS dnc FROM phone_numbers WHERE number = ?",
        [number],
      )
      .pipe(Effect.orDie);
    if (row === null) {
      return { consented: false, onDnc: false };
    }
    return {
      consented: row.consentSource !== null && row.consentedAt !== null,
      onDnc: Number(row.dnc) === 1,
    };
  });
