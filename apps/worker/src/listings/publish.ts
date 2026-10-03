import type { ListingStatus } from "../db/schema.ts";
import type { Band } from "../eval/eval.ts";

export const statusForBand = (band: Band): ListingStatus => {
  if (band === "auto" || band === "human") {
    return "in_review";
  }
  return "rejected";
};
