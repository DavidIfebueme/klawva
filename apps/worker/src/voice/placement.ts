import * as Effect from "effect/Effect";

export interface PhoneEnv {
  readonly BOLNA_API_KEY?: string;
  readonly TWILIO_ACCOUNT_SID?: string;
  readonly TWILIO_AUTH_TOKEN?: string;
  readonly TWILIO_FROM_NUMBER?: string;
  readonly VOICE_RELAY_URL?: string;
}
import type { DatabaseImpl } from "../db/database.ts";
import { bolnaCarrier, twilioCarrier, type Carrier } from "./carrier.ts";
import { dialChecked, type DialRefused } from "./dial.ts";
import type { CarrierError } from "./carrier.ts";
import type { IllegalTransportTransition } from "../session/transports.ts";
import { marketForNumber } from "./registry.ts";
import { maxSecondsForBudget } from "./ratecard.ts";
import type { Market } from "./rules.ts";

export type DialSkipReason =
  | "no_phone_block"
  | "inbound_only"
  | "no_callee"
  | "no_carrier_configured"
  | "no_consent"
  | "on_dnc"
  | "outside_calling_window"
  | "budget_too_small";

export interface DialOutcome {
  readonly dialed: boolean;
  readonly carrierRef: string | null;
  readonly carrier: string | null;
  readonly reason: string | null;
  readonly maxSeconds: number | null;
}

/**
 * picks the carrier per market. bolna owns the us and india legs; a nigeria leg
 * rides twilio because bolna refuses +234 on managed telephony.
 */
export const carrierForMarket = (env: PhoneEnv, market: Market): Carrier | null => {
  if (market === "ng") {
    const sid = env.TWILIO_ACCOUNT_SID ?? "";
    const token = env.TWILIO_AUTH_TOKEN ?? "";
    const from = env.TWILIO_FROM_NUMBER ?? "";
    const relay = env.VOICE_RELAY_URL ?? "";
    if (sid.length === 0 || token.length === 0 || from.length === 0 || relay.length === 0) {
      return null;
    }
    return twilioCarrier({
      accountSid: sid,
      authToken: token,
      fromNumber: from,
      relayUrl: relay,
    });
  }
  const key = env.BOLNA_API_KEY ?? "";
  if (key.length === 0) {
    return null;
  }
  return bolnaCarrier({ apiKey: key });
};

const calleeFromBrief = (brief: unknown): string | null => {
  if (typeof brief !== "object" || brief === null) {
    return null;
  }
  const record = brief as Record<string, unknown>;
  for (const key of ["phone", "callee", "to", "number"]) {
    const value = record[key];
    if (typeof value === "string" && value.startsWith("+")) {
      return value;
    }
  }
  return null;
};

export interface PhoneHireInput {
  readonly sessionId: string;
  readonly agentName: string;
  readonly manifest: {
    readonly phone?: { readonly outbound: boolean; readonly inbound: boolean; readonly script: string };
  };
  readonly brief: unknown;
  readonly budgetRemainingKobo: number;
}

export const placePhoneHire = (
  env: PhoneEnv,
  db: DatabaseImpl,
  input: PhoneHireInput,
  at: Date = new Date(),
): Effect.Effect<DialOutcome> =>
  Effect.gen(function* () {
    const phone = input.manifest.phone;
    if (phone === undefined) {
      return skip("no_phone_block");
    }
    if (!phone.outbound) {
      return skip("inbound_only");
    }
    const callee = calleeFromBrief(input.brief);
    if (callee === null) {
      return skip("no_callee");
    }
    const market = marketForNumber(callee);
    if (market === null) {
      return skip("no_carrier_configured");
    }
    const carrier = carrierForMarket(env, market);
    if (carrier === null) {
      return skip("no_carrier_configured");
    }
    const result = yield* dialChecked(db, carrier, {
      sessionId: input.sessionId,
      to: callee,
      market,
      agentName: input.agentName,
      script: phone.script,
      budgetRemainingKobo: input.budgetRemainingKobo,
      at,
    }).pipe(
      Effect.map((handle) => ({ ok: true as const, handle })),
      Effect.catch(
        (
          error: DialRefused | CarrierError | IllegalTransportTransition,
        ) =>
        Effect.succeed({
          ok: false as const,
          reason: "reason" in error ? String(error.reason) : "transport_transition",
        }),
        ),
    );
    if (!result.ok) {
      return skip(result.reason);
    }
    return {
      dialed: true,
      carrierRef: result.handle.carrierRef,
      carrier: result.handle.carrier,
      reason: null,
      maxSeconds: result.handle.maxSeconds,
    };
  });

const skip = (reason: DialSkipReason | string): DialOutcome => ({
  dialed: false,
  carrierRef: null,
  carrier: null,
  reason,
  maxSeconds: null,
});

export const budgetSecondsFor = (
  budgetRemainingKobo: number,
  carrier: string,
): number | null => {
  if (carrier !== "twilio" && carrier !== "bolna" && carrier !== "wholesale") {
    return null;
  }
  return maxSecondsForBudget(budgetRemainingKobo, carrier);
};
