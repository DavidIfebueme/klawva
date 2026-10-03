import type { BillingProfile } from "@/types";

const PROFILE: BillingProfile = {
  provider: "paystack",
  amountMinor: 1500,
  currency: "NGN",
  amountDisplay: "₦15",
  region: "nigeria",
  countryCode: "NG",
};

export function useBillingProfile() {
  return { profile: PROFILE, loading: false };
}
