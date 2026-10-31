import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import { ListingConflict } from "../errors.ts";
import {
  authorStanding,
  countListings,
  linkPayoutAccount,
  listingCap,
  tierFor,
  type KycTier,
} from "../marketplace/kyc.ts";

export interface PayoutOverview {
  readonly tier: KycTier;
  readonly country: string | null;
  readonly tin: string | null;
  readonly psp: string | null;
  readonly subaccount: string | null;
  readonly currency: string | null;
  readonly status: string | null;
}

const nullable = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

export const payoutOverview = (
  db: DatabaseImpl,
  userId: string,
): Effect.Effect<PayoutOverview> =>
  db
    .first(
      "SELECT p.kyc_tier AS kycTier, p.country AS country, p.tin AS tin, a.psp AS psp, a.subaccount AS subaccount, a.currency AS currency, a.status AS status FROM author_profiles p LEFT JOIN payout_accounts a ON a.rowid = (SELECT x.rowid FROM payout_accounts x WHERE x.author_id = p.user_id ORDER BY CASE x.status WHEN 'active' THEN 0 ELSE 1 END, x.psp LIMIT 1) WHERE p.user_id = ?",
      [userId],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => {
        const standing = tierFor(row ?? {});
        return {
          tier: standing.tier,
          country: standing.country,
          tin: standing.tin,
          psp: nullable(row?.psp),
          subaccount: nullable(row?.subaccount),
          currency: nullable(row?.currency),
          status: nullable(row?.status),
        };
      }),
    );

export interface LinkPayoutInput {
  readonly psp: "paystack" | "flutterwave";
  readonly subaccount: string;
  readonly country: string;
  readonly currency: string;
  readonly tin: string;
  readonly acceptTerms: boolean;
}

export const linkAuthorPayout = (
  db: DatabaseImpl,
  userId: string,
  input: LinkPayoutInput,
): Effect.Effect<{ ok: true }, ListingConflict> =>
  Effect.gen(function* () {
    const outcome = yield* linkPayoutAccount(db, userId, input);
    if (!outcome.ok) {
      return yield* Effect.fail(new ListingConflict({ reason: outcome.reason }));
    }
    return { ok: true as const };
  });

export interface PendingEarnings {
  readonly grossMinor: number;
  readonly commissionMinor: number;
  readonly netMinor: number;
}

export interface EarningInstruction {
  readonly period: string;
  readonly grossMinor: number;
  readonly commissionMinor: number;
  readonly whtMinor: number;
  readonly netMinor: number;
  readonly status: string;
  readonly psp: string;
  readonly createdAt: string;
}

export interface Earnings {
  readonly tier: KycTier;
  readonly currency: string;
  readonly pending: PendingEarnings;
  readonly instructions: ReadonlyArray<EarningInstruction>;
}

export const authorEarnings = (
  db: DatabaseImpl,
  userId: string,
): Effect.Effect<Earnings> =>
  Effect.gen(function* () {
    const standing = (yield* authorStanding(db, userId)) ?? tierFor({});
    const period = new Date().toISOString().slice(0, 7);
    const pendingRow = yield* db
      .first(
        "SELECT COALESCE(SUM(gross_minor), 0) AS grossMinor, COALESCE(SUM(commission_minor), 0) AS commissionMinor, COALESCE(SUM(net_minor), 0) AS netMinor FROM payment_splits WHERE author_id = ? AND substr(created_at, 1, 7) = ?",
        [userId, period],
      )
      .pipe(Effect.orDie);
    const currencyRow = yield* db
      .first(
        "SELECT COALESCE((SELECT currency FROM payout_accounts WHERE author_id = ? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END LIMIT 1), 'NGN') AS currency",
        [userId],
      )
      .pipe(Effect.orDie);
    const rows = yield* db
      .all(
        "SELECT period AS period, gross_minor AS grossMinor, commission_minor AS commissionMinor, wht_minor AS whtMinor, net_minor AS netMinor, status AS status, psp AS psp, created_at AS createdAt FROM payout_instructions WHERE author_id = ? ORDER BY created_at DESC LIMIT 12",
        [userId],
      )
      .pipe(Effect.orDie);
    return {
      tier: standing.tier,
      currency: String(currencyRow?.currency ?? "NGN"),
      pending: {
        grossMinor: Number(pendingRow?.grossMinor ?? 0),
        commissionMinor: Number(pendingRow?.commissionMinor ?? 0),
        netMinor: Number(pendingRow?.netMinor ?? 0),
      },
      instructions: rows.map((row) => ({
        period: String(row.period),
        grossMinor: Number(row.grossMinor),
        commissionMinor: Number(row.commissionMinor),
        whtMinor: Number(row.whtMinor),
        netMinor: Number(row.netMinor),
        status: String(row.status),
        psp: String(row.psp),
        createdAt: String(row.createdAt),
      })),
    };
  });

export interface AuthorLimits {
  readonly tier: KycTier;
  readonly cap: number;
  readonly used: number;
}

export const authorLimits = (
  db: DatabaseImpl,
  userId: string,
): Effect.Effect<AuthorLimits> =>
  Effect.gen(function* () {
    const standing = (yield* authorStanding(db, userId)) ?? tierFor({});
    const used = yield* countListings(db, userId);
    return { tier: standing.tier, cap: listingCap[standing.tier], used };
  });
