export const nairaPerDollar = 1500;

const koboPerNaira = 100;

export type CarrierName = "bolna" | "twilio" | "wholesale";

const centsPerMinute: Record<CarrierName, number> = {
  bolna: 8,
  twilio: 23,
  wholesale: 6.5,
};

export const koboPerMinute = (carrier: CarrierName): number =>
  Math.round((centsPerMinute[carrier] / 100) * nairaPerDollar * koboPerNaira);

export const minimumCallSeconds = 60;

export const maxSecondsForBudget = (
  budgetRemainingKobo: number,
  carrier: CarrierName,
): number => {
  const koboPerSecond = koboPerMinute(carrier) / 60;
  return Math.floor(budgetRemainingKobo / koboPerSecond);
};

export const budgetCoversCall = (
  budgetRemainingKobo: number,
  carrier: CarrierName,
): boolean =>
  maxSecondsForBudget(budgetRemainingKobo, carrier) >= minimumCallSeconds;
