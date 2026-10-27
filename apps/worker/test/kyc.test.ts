import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../src/db/database.ts";
import {
  canCreateListing,
  listingCap,
  payoutVerdict,
  tierFor,
  weeklyCeilingMinor,
} from "../src/marketplace/kyc.ts";

const dbOf = (row: unknown): DatabaseImpl => ({
  all: () => Effect.succeed([]),
  first: () => Effect.succeed((row ?? null) as never),
  run: () => Effect.void,
  batch: () => Effect.void,
  changed: () => Effect.succeed(0),
});

describe("linking a payout account", () => {
  it("refuses without accepting the author terms", async () => {
    const { linkPayoutAccount } = await import("../src/marketplace/kyc.ts");
    const result = await Effect.runPromise(
      linkPayoutAccount(dbOf(null), "u1", {
        psp: "paystack",
        subaccount: "ACCT",
        country: "NG",
        currency: "NGN",
        tin: "T1",
        acceptTerms: false,
      }),
    );
    expect(result).toEqual({ ok: false, reason: "author_terms_not_accepted" });
  });

  it("links the account and lifts the author to tier 1", async () => {
    const { linkPayoutAccount } = await import("../src/marketplace/kyc.ts");
    const calls: string[] = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([]),
      first: () => Effect.succeed(null),
      run: (sql) => {
        calls.push(String(sql));
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    const result = await Effect.runPromise(
      linkPayoutAccount(db, "u1", {
        psp: "flutterwave",
        subaccount: "FLW_1",
        country: "IN",
        currency: "NGN",
        tin: "T2",
        acceptTerms: true,
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(calls.some((sql) => sql.includes("INSERT INTO payout_accounts"))).toBe(true);
    expect(calls.some((sql) => sql.includes("kyc_tier = CASE"))).toBe(true);
  });
});

describe("tiers", () => {
  it("reads a tier and normalises nonsense to zero", () => {
    expect(tierFor({ kycTier: 2 }).tier).toBe(2);
    expect(tierFor({ kycTier: 1 }).tier).toBe(1);
    expect(tierFor({ kycTier: "9" }).tier).toBe(2);
    expect(tierFor({}).tier).toBe(0);
  });

  it("caps listings by tier", () => {
    expect(canCreateListing(tierFor({ kycTier: 0 }), listingCap[0] - 1)).toBe(true);
    expect(canCreateListing(tierFor({ kycTier: 0 }), listingCap[0])).toBe(false);
  });
});

describe("payout verdict", () => {
  const linked = tierFor({ kycTier: 1, tin: "TIN1", payoutAccountId: "acc_1", country: "NG" });

  it("blocks tier zero before anything else", () => {
    expect(payoutVerdict({ standing: tierFor({}), instructionNetMinor: 1, paidThisWeekMinor: 0 })).toEqual({
      ok: false,
      reason: "kyc_required",
    });
  });

  it("requires a linked account and a tin", () => {
    expect(
      payoutVerdict({ standing: tierFor({ kycTier: 1 }), instructionNetMinor: 1, paidThisWeekMinor: 0 }),
    ).toEqual({ ok: false, reason: "payout_account_missing" });
    expect(
      payoutVerdict({
        standing: tierFor({ kycTier: 1, payoutAccountId: "a" }),
        instructionNetMinor: 1,
        paidThisWeekMinor: 0,
      }),
    ).toEqual({ ok: false, reason: "tin_required" });
  });

  it("enforces the weekly ceiling", () => {
    expect(
      payoutVerdict({ standing: linked, instructionNetMinor: weeklyCeilingMinor[1], paidThisWeekMinor: 1 }),
    ).toEqual({ ok: false, reason: "weekly_ceiling" });
    expect(
      payoutVerdict({ standing: linked, instructionNetMinor: 1_000, paidThisWeekMinor: 0 }).ok,
    ).toBe(true);
  });
});
