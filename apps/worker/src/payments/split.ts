export const PLATFORM_COMMISSION_RATE = 0.2;

export interface Split {
  readonly grossMinor: number;
  readonly commissionMinor: number;
  readonly netMinor: number;
  readonly commissionRate: number;
}

/**
 * the split is computed here, from server state only. never from a request body:
 * marketplace split manipulation is a known attack class and the client must not
 * be able to move a share.
 */
export const splitPayment = (
  grossMinor: number,
  commissionRate: number = PLATFORM_COMMISSION_RATE,
): Split => {
  if (!Number.isFinite(grossMinor) || grossMinor <= 0) {
    return { grossMinor: 0, commissionMinor: 0, netMinor: 0, commissionRate };
  }
  const rate = Math.min(Math.max(commissionRate, 0), 1);
  const commission = Math.round(grossMinor * rate);
  return {
    grossMinor,
    commissionMinor: commission,
    netMinor: grossMinor - commission,
    commissionRate: rate,
  };
};

export const isRefundable = (params: {
  readonly paidAt: string;
  readonly shiftEndedAt: string | null;
  readonly now: Date;
  readonly windowHours?: number;
}): boolean => {
  const windowHours = params.windowHours ?? 72;
  const end = params.shiftEndedAt === null ? null : Date.parse(params.shiftEndedAt);
  if (end === null) {
    return false;
  }
  return params.now.getTime() <= end + windowHours * 60 * 60 * 1_000;
};

export type RefundSource =
  | "psp_reversible"
  | "author_share_reversed"
  | "platform_funded";

export const structuralRefundClasses = [
  "no_artifact",
  "revoked_midshift",
  "input_required",
  "cancel_by_us",
] as const;

export type StructuralRefundClass = (typeof structuralRefundClasses)[number];

export const isStructuralRefund = (reason: string): reason is StructuralRefundClass =>
  (structuralRefundClasses as ReadonlyArray<string>).includes(reason);
