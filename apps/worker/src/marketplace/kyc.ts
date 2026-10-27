import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

export type KycTier = 0 | 1 | 2;

export const KYC_TIER_LABELS: Record<KycTier, string> = {
  0: "sandbox only, no payouts, two listings",
  1: "payouts on, weekly ceiling",
  2: "raised ceiling after a clean month",
};

export const weeklyCeilingMinor: Record<KycTier, number> = {
  0: 0,
  1: 5_000_000,
  2: 50_000_000,
};

export const listingCap: Record<KycTier, number> = { 0: 2, 1: 20, 2: 200 };

export interface AuthorStanding {
  readonly tier: KycTier;
  readonly country: string | null;
  readonly tin: string | null;
  readonly hasPayoutAccount: boolean;
}

export const tierFor = (row: {
  readonly kycTier?: unknown;
  readonly country?: unknown;
  readonly tin?: unknown;
  readonly payoutAccountId?: unknown;
}): AuthorStanding => {
  const raw = Number(row.kycTier ?? 0);
  const tier: KycTier = raw >= 2 ? 2 : raw === 1 ? 1 : 0;
  return {
    tier,
    country:
      row.country === null || row.country === undefined ? null : String(row.country),
    tin: row.tin === null || row.tin === undefined ? null : String(row.tin),
    hasPayoutAccount:
      row.payoutAccountId !== null && row.payoutAccountId !== undefined,
  };
};

export const payoutVerdict = (params: {
  readonly standing: AuthorStanding;
  readonly instructionNetMinor: number;
  readonly paidThisWeekMinor: number;
}): { readonly ok: true } | { readonly ok: false; readonly reason: string } => {
  const { standing } = params;
  if (standing.tier === 0) {
    return { ok: false, reason: "kyc_required" };
  }
  if (!standing.hasPayoutAccount) {
    return { ok: false, reason: "payout_account_missing" };
  }
  if (standing.tin === null || standing.tin.length === 0) {
    return { ok: false, reason: "tin_required" };
  }
  const ceiling = weeklyCeilingMinor[standing.tier];
  if (params.paidThisWeekMinor + params.instructionNetMinor > ceiling) {
    return { ok: false, reason: "weekly_ceiling" };
  }
  return { ok: true };
};

export const authorStanding = (
  db: DatabaseImpl,
  authorId: string,
): Effect.Effect<AuthorStanding | null> =>
  db
    .first(
      "SELECT kyc_tier AS kycTier, country AS country, tin AS tin, payout_account_id AS payoutAccountId FROM author_profiles WHERE user_id = ?",
      [authorId],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row === null ? null : tierFor(row))),
    );

export const countListings = (
  db: DatabaseImpl,
  authorId: string,
): Effect.Effect<number> =>
  db
    .first(
      "SELECT COUNT(*) AS count FROM agent_listings WHERE owner_id = ?",
      [authorId],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row === null ? 0 : Number(row.count))),
    );

export const canCreateListing = (
  standing: AuthorStanding,
  existing: number,
): boolean => existing < listingCap[standing.tier];

export const linkPayoutAccount = (
  db: DatabaseImpl,
  authorId: string,
  input: {
    readonly psp: "paystack" | "flutterwave";
    readonly subaccount: string;
    readonly country: string;
    readonly currency: string;
    readonly tin: string;
    readonly acceptTerms: boolean;
  },
): Effect.Effect<{ ok: true } | { ok: false; reason: string }> =>
  Effect.gen(function* () {
    if (!input.acceptTerms) {
      return { ok: false, reason: "author_terms_not_accepted" };
    }
    if (input.tin.trim().length === 0) {
      return { ok: false, reason: "tin_required" };
    }
    if (input.subaccount.trim().length === 0) {
      return { ok: false, reason: "subaccount_required" };
    }
    const now = new Date().toISOString();
    yield* db
      .run(
        "INSERT INTO payout_accounts (id, author_id, psp, subaccount, country, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?) ON CONFLICT(author_id, psp) DO UPDATE SET subaccount = excluded.subaccount, country = excluded.country, currency = excluded.currency, status = 'active'",
        [
          crypto.randomUUID(),
          authorId,
          input.psp,
          input.subaccount,
          input.country,
          input.currency,
          now,
        ],
      )
      .pipe(Effect.orDie);
    yield* db
      .run(
        "UPDATE author_profiles SET tin = ?, country = ?, payout_account_id = ?, kyc_tier = CASE WHEN kyc_tier < 1 THEN 1 ELSE kyc_tier END WHERE user_id = ?",
        [input.tin, input.country, input.subaccount, authorId],
      )
      .pipe(Effect.orDie);
    return { ok: true as const };
  });

export const tierUpgradeEligible = (params: {
  readonly standing: AuthorStanding;
  readonly cleanDays: number;
  readonly lastShopperVerdict: string | null;
}): boolean =>
  params.standing.tier === 1 &&
  params.cleanDays >= 30 &&
  params.lastShopperVerdict === "pass";
