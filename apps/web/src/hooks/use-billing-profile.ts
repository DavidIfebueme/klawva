import type { BillingProfile } from "@/types";

const PROFILE: BillingProfile = {
  provider: "paystack",
  amountMinor: 100000,
  currency: "NGN",
  amountDisplay: "₦1,000",
  region: "nigeria",
  countryCode: "NG",
};

export function useBillingProfile() {
  return { profile: PROFILE, loading: false };
}
