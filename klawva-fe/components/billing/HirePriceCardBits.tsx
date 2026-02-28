'use client';

import { useBillingProfile } from '@/hooks/use-billing-profile';

export function HirePriceCardBits() {
  const { profile } = useBillingProfile();

  return (
    <>
      <div className="mb-8">
        <div className="flex items-baseline gap-4 mb-2">
          <span className="font-syne font-extrabold text-5xl text-klawva-accent">{profile.amountDisplay}</span>
        </div>
        <p className="font-mono text-klawva-dim text-sm">per 24-hour session</p>
      </div>

      <div className="text-center">
        <p className="font-mono text-klawva-dim text-xs mb-4">
          Secure payment via {profile.provider === 'paystack' ? 'Paystack (Nigeria)' : 'Stripe (Global)'}
        </p>
      </div>
    </>
  );
}
