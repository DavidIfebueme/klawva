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

export const MINIMUM_INTERNATIONAL_PRICE_MINOR = 200_000;

export const minimumPriceForCorridor = (international: boolean): number | null =>
  international ? MINIMUM_INTERNATIONAL_PRICE_MINOR : null;

export const corridors = (grossMinor: number): ReadonlyArray<UnitEconomicsRow> => [
  unitEconomics({ label: "domestic", grossMinor, commissionRate: 0.2, whtRate: 0, international: false }),
  unitEconomics({
    label: "non-resident",
    grossMinor,
    commissionRate: 0.2,
    whtRate: WHT_NON_RESIDENT,
    international: true,
  }),
  unitEconomics({
    label: "non-resident-cheapest-international",
    grossMinor,
    commissionRate: 0.2,
    whtRate: WHT_NON_RESIDENT,
    international: true,
  }),
];

export const corridorBlocked = (rows: ReadonlyArray<UnitEconomicsRow>): ReadonlyArray<string> =>
  rows.filter((row) => row.negative).map((row) => row.label);

export const listingPriceBlocked = (params: {
  readonly priceMinor: number;
  readonly international: boolean;
}): ReadonlyArray<string> => {
  const rows = corridors(params.priceMinor).filter(
    (row) => (params.international ? row.label !== "domestic" : row.label === "domestic"),
  );
  const blocked = corridorBlocked(rows);
  if (blocked.length > 0) {
    return blocked;
  }
  if (params.international && params.priceMinor < MINIMUM_INTERNATIONAL_PRICE_MINOR) {
    return ["minimum_price"];
  }
  return blocked;
};

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

export const reserveFromLedger = (db: DatabaseImpl, period: string): Effect.Effect<number> =>
  db
    .first(
      "SELECT COALESCE(SUM(reserved_minor),0) AS reserved FROM refund_reserve WHERE period = ?",
      [period],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row === null ? 0 : Number(row.reserved))),
    );

export const platformFundedFromLedger = (db: DatabaseImpl, period: string): Effect.Effect<number> =>
  db
    .first(
      "SELECT COALESCE(SUM(refund_minor),0) AS funded FROM payments WHERE refund_source = 'platform_funded' AND substr(refunded_at, 1, 7) = ?",
      [period],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row === null ? 0 : Number(row.funded))),
    );
