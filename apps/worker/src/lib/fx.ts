import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";

export const displayCurrencies = ["NGN", "USD", "INR"] as const;
export type DisplayCurrency = (typeof displayCurrencies)[number];

export const currencyForCountry = (country: string | null): DisplayCurrency => {
  if (country === "IN") return "INR";
  if (country === "US") return "USD";
  return "NGN";
};

export interface FxRate {
  readonly perNgn: number;
  readonly updatedAt: string;
}

const FxResponse = Schema.Struct({
  result: Schema.String,
  rates: Schema.Struct({ USD: Schema.Number, INR: Schema.Number }),
});

const readRate = (
  db: DatabaseImpl,
  currency: DisplayCurrency,
): Effect.Effect<FxRate | null> =>
  db
    .first("SELECT per_ngn AS perNgn, updated_at AS updatedAt FROM fx_rates WHERE currency = ?", [
      currency,
    ])
    .pipe(
      Effect.map((row) =>
        row === null
          ? null
          : { perNgn: Number(row.perNgn), updatedAt: String(row.updatedAt) },
      ),
      Effect.orDie,
    );

export const refreshRates = (
  db: DatabaseImpl,
  fetchImpl: (url: string) => Promise<Response> = (url) => fetch(url),
  now: Date = new Date(),
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchImpl("https://open.er-api.com/v6/latest/NGN"),
      catch: () => new Error("fx_unreachable"),
    }).pipe(Effect.catch(() => Effect.succeed(null)));
    if (response === null || !response.ok) {
      return false;
    }
    const decoded = yield* Effect.tryPromise({
      try: async () => response.json() as Promise<unknown>,
      catch: () => new Error("fx_unreadable"),
    }).pipe(Effect.catch(() => Effect.succeed(null)));
    if (decoded === null) {
      return false;
    }
    const parsed = Schema.decodeUnknownOption(FxResponse)(decoded);
    if (parsed._tag === "None" || parsed.value.result !== "success") {
      return false;
    }
    const { USD: usd, INR: inr } = parsed.value.rates;
    if (
      !Number.isFinite(usd) ||
      usd <= 0 ||
      !Number.isFinite(inr) ||
      inr <= 0
    ) {
      return false;
    }
    const at = now.toISOString();
    yield* db
      .batch([
        {
          sql: "INSERT INTO fx_rates (currency, per_ngn, updated_at) VALUES ('USD', ?, ?) ON CONFLICT(currency) DO UPDATE SET per_ngn = excluded.per_ngn, updated_at = excluded.updated_at",
          params: [parsed.value.rates.USD, at],
        },
        {
          sql: "INSERT INTO fx_rates (currency, per_ngn, updated_at) VALUES ('INR', ?, ?) ON CONFLICT(currency) DO UPDATE SET per_ngn = excluded.per_ngn, updated_at = excluded.updated_at",
          params: [parsed.value.rates.INR, at],
        },
      ])
      .pipe(Effect.orDie);
    return true;
  });

export const refreshRatesIfStale = (
  db: DatabaseImpl,
  fetchImpl: (url: string) => Promise<Response> = (url) => fetch(url),
  now: Date = new Date(),
  maxAgeMs: number = 12 * 60 * 60 * 1_000,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const row = yield* db
      .first("SELECT MAX(updated_at) AS updatedAt FROM fx_rates", [])
      .pipe(Effect.orDie);
    const stamp = row === null ? null : row.updatedAt;
    if (stamp !== null && stamp !== undefined) {
      const age = now.getTime() - Date.parse(String(stamp));
      if (Number.isFinite(age) && age < maxAgeMs) {
        return false;
      }
    }
    return yield* refreshRates(db, fetchImpl, now);
  });

export const displayContext = (
  db: DatabaseImpl,
  country: string | null,
): Effect.Effect<{
  readonly country: string | null;
  readonly currency: DisplayCurrency;
  readonly rate: number;
  readonly updatedAt: string | null;
}> =>
  Effect.gen(function* () {
    const currency = currencyForCountry(country);
    if (currency === "NGN") {
      return { country, currency, rate: 1, updatedAt: null };
    }
    const rate = yield* readRate(db, currency);
    if (rate === null) {
      return { country, currency: "NGN" as const, rate: 1, updatedAt: null };
    }
    return {
      country,
      currency,
      rate: rate.perNgn,
      updatedAt: rate.updatedAt,
    };
  });
