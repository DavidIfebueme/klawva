import * as Schema from "effect/Schema";
import { useRouteLoaderData } from "react-router-dom";

export const displayContext = Schema.Struct({
  country: Schema.NullOr(Schema.String),
  currency: Schema.String,
  rate: Schema.Number,
  updatedAt: Schema.NullOr(Schema.String),
});
export type DisplayContext = typeof displayContext.Type;

export const fallbackDisplay: DisplayContext = {
  country: null,
  currency: "NGN",
  rate: 1,
  updatedAt: null,
};

export const loadDisplay = async (country: string | null): Promise<DisplayContext> => {
  const query = country === null ? "" : `?country=${encodeURIComponent(country)}`;
  const res = await fetch(`/api/display${query}`);
  if (!res.ok) {
    return fallbackDisplay;
  }
  return Schema.decodeUnknownSync(displayContext)(await res.json());
};

export const useDisplay = (): DisplayContext =>
  useRouteLoaderData<DisplayContext>("root") ?? fallbackDisplay;

export const formatNaira = (priceMinor: number): string =>
  `₦${(priceMinor / 100).toLocaleString()}`;

export const formatPrice = (
  priceMinor: number,
  display: DisplayContext,
): string => {
  const naira = priceMinor / 100;
  if (display.currency === "USD") {
    return `$${(naira * display.rate).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (display.currency === "INR") {
    return `₹${Math.round(naira * display.rate).toLocaleString("en-IN")}`;
  }
  return formatNaira(priceMinor);
};

export const conversionNote = (display: DisplayContext): string | null => {
  if (display.currency === "NGN") {
    return null;
  }
  return `Shown in ${display.currency} at about ${display.rate} per naira. You pay in naira and your bank converts.`;
};
