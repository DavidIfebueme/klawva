import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import {
  PLATFORM_COMMISSION_RATE,
  isRefundable,
  isStructuralRefund,
  splitPayment,
} from "../src/payments/split.ts";

describe("split at source", () => {
  it("splits twenty percent at the platform rate", () => {
    const split = splitPayment(10_000);
    expect(split.commissionMinor).toBe(2_000);
    expect(split.netMinor).toBe(8_000);
    expect(split.commissionRate).toBe(PLATFORM_COMMISSION_RATE);
  });

  it("rounds to whole minor units and never loses a kobo", () => {
    const split = splitPayment(999);
    expect(split.commissionMinor + split.netMinor).toBe(999);
  });

  it("refuses to compute from a nonsense amount", () => {
    expect(splitPayment(0).netMinor).toBe(0);
    expect(splitPayment(-5).grossMinor).toBe(0);
    expect(splitPayment(Number.NaN).grossMinor).toBe(0);
  });

  it("clamps a rate outside zero to one", () => {
    expect(splitPayment(1_000, 2).commissionMinor).toBe(1_000);
    expect(splitPayment(1_000, -1).commissionMinor).toBe(0);
  });
});

describe("refund window", () => {
  const end = "2026-10-27T10:00:00Z";
  it("honours 72 hours after the shift, not after payment", () => {
    expect(
      isRefundable({ paidAt: "2026-10-26T09:00:00Z", shiftEndedAt: end, now: new Date("2026-10-28T10:00:00Z") }),
    ).toBe(true);
    expect(
      isRefundable({ paidAt: "2026-10-26T09:00:00Z", shiftEndedAt: end, now: new Date("2026-10-31T11:00:00Z") }),
    ).toBe(false);
  });

  it("a shift that never ended is not refundable by this rule", () => {
    expect(isRefundable({ paidAt: "2026-10-26T09:00:00Z", shiftEndedAt: null, now: new Date() })).toBe(false);
  });
});

describe("refund classes stay closed", () => {
  it("accepts only the four structural reasons", () => {
    expect(isStructuralRefund("no_artifact")).toBe(true);
    expect(isStructuralRefund("input_required")).toBe(true);
    expect(isStructuralRefund("quality")).toBe(false);
    expect(isStructuralRefund("late_delivery")).toBe(false);
  });
});

describe("split reaches the psp, not just our ledger", () => {
  it("initialize carries the subaccount and our commission when the author has one", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body });
      return new Response(JSON.stringify({ data: { authorization_url: "https://pay" } }), { status: 200 });
    }) as typeof fetch;
    const { initializePayment } = await import("../src/payments/paystack.ts");
    await Effect.runPromise(
      initializePayment({
        secret: "sk_test",
        sessionId: "s1",
        amountMinor: 10_000,
        callbackUrl: "https://klawva.xyz/cb",
        email: "a@b.com",
        subaccount: "ACCT_123",
        commissionMinor: 2_000,
      }),
    );
    const body = JSON.parse(String((calls[0] as { body: string }).body)) as Record<string, unknown>;
    expect(body.subaccount).toBe("ACCT_123");
    expect(body.transaction_charge).toBe(2_000);
    expect(body.bearer).toBe("account");
  });
});
