'use client';

import { useEffect, useState } from 'react';

import { getBillingProfile } from '@/lib/api';
import { BillingProfile } from '@/types';

const FALLBACK_PROFILE: BillingProfile = {
  provider: 'stripe',
  amountMinor: 199,
  currency: 'USD',
  amountDisplay: '$1.99',
  region: 'global',
  countryCode: null,
};

export function useBillingProfile() {
  const [profile, setProfile] = useState<BillingProfile>(FALLBACK_PROFILE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getBillingProfile()
      .then((result) => {
        if (active) {
          setProfile(result);
        }
      })
      .catch(() => {
        if (active) {
          setProfile(FALLBACK_PROFILE);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { profile, loading };
}
