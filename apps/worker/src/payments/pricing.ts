export const durationOptions = [1, 2, 7, 30] as const;

export type DurationDays = (typeof durationOptions)[number];

const discounts: Record<number, number> = {
  1: 0,
  2: 0.05,
  7: 0.15,
  30: 0.25,
};

export const isSupportedDuration = (days: number): days is DurationDays =>
  (durationOptions as ReadonlyArray<number>).includes(days);

export const discountFor = (days: DurationDays): number =>
  discounts[days] ?? 0;

export const priceForDays = (
  unitMinor: number,
  days: number,
): number | null => {
  if (!isSupportedDuration(days)) {
    return null;
  }
  return Math.round((unitMinor * days * (1 - discountFor(days))) / 100) * 100;
};
