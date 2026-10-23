import * as Schema from "effect/Schema";
import { LaunchMarket } from "../db/schema.ts";

export interface VoiceEntry {
  readonly demo: string;
  readonly production: string;
}

const registry: Record<LaunchMarket, VoiceEntry> = {
  us: { demo: "en-US-AvaNeural", production: "en-US-AvaNeural" },
  ng: { demo: "en-NG-EzinneNeural", production: "en-NG-EzinneNeural" },
  in: { demo: "en-IN-NeerjaExpressiveNeural", production: "en-IN-NeerjaExpressiveNeural" },
};

export const voiceFor = (market: LaunchMarket): VoiceEntry => registry[market];

const voiceIds: ReadonlyArray<string> = [
  ...new Set(
    Object.values(registry).flatMap((entry) => [entry.demo, entry.production]),
  ),
];

export const isKnownVoiceId = (voiceId: string): boolean =>
  voiceIds.includes(voiceId);

const countryPrefix: ReadonlyArray<{ prefix: string; market: LaunchMarket }> = [
  { prefix: "+234", market: "ng" },
  { prefix: "+91", market: "in" },
  { prefix: "+1", market: "us" },
];

export const marketForNumber = (number: string): LaunchMarket | null => {
  const hit = countryPrefix.find((entry) => number.startsWith(entry.prefix));
  return hit === undefined ? null : hit.market;
};

export const resolveVoiceId = (params: {
  readonly accountMarket: LaunchMarket | null;
  readonly calleeNumber?: string;
  readonly manifestVoiceId?: string;
  readonly phase?: "demo" | "production";
}): string => {
  if (params.manifestVoiceId !== undefined && isKnownVoiceId(params.manifestVoiceId)) {
    return params.manifestVoiceId;
  }
  const calleeMarket =
    params.calleeNumber === undefined ? null : marketForNumber(params.calleeNumber);
  const market = calleeMarket ?? params.accountMarket ?? "us";
  const phase = params.phase ?? "demo";
  const entry = voiceFor(market);
  return phase === "production" ? entry.production : entry.demo;
};

export const AccountMarket = LaunchMarket;
export type AccountMarket = LaunchMarket;

export const accountMarketOrNull = Schema.NullOr(LaunchMarket);
