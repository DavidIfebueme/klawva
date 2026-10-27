import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import { VAT_RATE, WHT_NON_RESIDENT } from "./ledger.ts";
import { RESERVE_RATE } from "./reserve.ts";

export interface UnitEconomicsRow {
  readonly label: string;
  readonly grossMinor: number;
  readonly commissionMinor: number;
  readonly vatMinor: number;
  readonly whtMinor: number;
  readonly pspFeeMinor: number;
  readonly reserveMinor: number;
  readonly authorNetMinor: number;
  readonly platformNetMinor: number;
  readonly negative: boolean;
}

export const pspFeeFor = (grossMinor: number, international: boolean): number => {
  if (!international) {
    if (grossMinor <= 5_000) return 1_000;
    if (grossMinor <= 50_000) return 2_500;
    return 5_000;
  }
  return 6_000_000;
};

export const unitEconomics = (params: {
  readonly label: string;
  readonly grossMinor: number;
  readonly commissionRate: number;
  readonly whtRate: number;
  readonly international: boolean;
}): UnitEconomicsRow => {
  const commissionMinor = Math.round(params.grossMinor * params.commissionRate);
  const vatMinor = Math.round(commissionMinor * VAT_RATE);
  const authorShareMinor = params.grossMinor - commissionMinor;
  const whtMinor = Math.round(authorShareMinor * params.whtRate);
  const pspFeeMinor = pspFeeFor(params.grossMinor, params.international);
  const reserveMinor = Math.round(commissionMinor * RESERVE_RATE);
  const authorNetMinor = authorShareMinor - whtMinor;
  const platformNetMinor = commissionMinor - vatMinor - pspFeeMinor - reserveMinor;
  return {
    label: params.label,
    grossMinor: params.grossMinor,
    commissionMinor,
    vatMinor,
    whtMinor,
    pspFeeMinor,
    reserveMinor,
    authorNetMinor,
    platformNetMinor,
    negative: authorNetMinor < 0 || platformNetMinor < 0,
  };
};

export const corridors = (grossMinor: number): ReadonlyArray<UnitEconomicsRow> => [
  unitEconomics({ label: "domestic", grossMinor, commissionRate: 0.2, whtRate: 0, international: false }),
  unitEconomics({
    label: "non-resident",
    grossMinor,
    commissionRate: 0.2,
    whtRate: WHT_NON_RESIDENT,
    international: true,
  }),
];

export const corridorBlocked = (rows: ReadonlyArray<UnitEconomicsRow>): ReadonlyArray<string> =>
  rows.filter((row) => row.negative).map((row) => row.label);

export const lastPeriod = (now: Date = new Date()): string => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const previous = new Date(Date.UTC(year, month - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const ledgerTotals = (
  db: DatabaseImpl,
  period: string,
): Effect.Effect<{ grossMinor: number; commissionMinor: number; netMinor: number }> =>
  db
    .first(
      "SELECT COALESCE(SUM(gross_minor),0) AS grossMinor, COALESCE(SUM(commission_minor),0) AS commissionMinor, COALESCE(SUM(net_minor),0) AS netMinor FROM payout_instructions WHERE period = ?",
      [period],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => ({
        grossMinor: row === null ? 0 : Number(row.grossMinor),
        commissionMinor: row === null ? 0 : Number(row.commissionMinor),
        netMinor: row === null ? 0 : Number(row.netMinor),
      })),
    );
