import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import { bolnaCarrier, twilioCarrier, type Carrier } from "./carrier.ts";
import { dialChecked, type DialRefused } from "./dial.ts";
import type { CarrierError } from "./carrier.ts";
import { claimDial, deferTransport, type IllegalTransportTransition } from "../session/transports.ts";
import { marketForNumber } from "./registry.ts";
import { maxSecondsForBudget } from "./ratecard.ts";
import { fileCallReport } from "../report/report.ts";
import { isE164, type Market } from "./rules.ts";

export interface PhoneEnv {
  readonly BOLNA_API_KEY?: string;
  readonly TWILIO_ACCOUNT_SID?: string;
  readonly TWILIO_AUTH_TOKEN?: string;
  readonly TWILIO_FROM_NUMBER?: string;
  readonly VOICE_RELAY_URL?: string;
  readonly FRONTEND_BASE_URL?: string;
  readonly CRON_SECRET?: string;
  readonly VOICE_WEBHOOK_SECRET?: string;
}

export type DialSkipReason =
  | "no_phone_block"
  | "inbound_only"
  | "already_dialed"
  | "dial_in_flight"
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

const bolnaWebhookUrl = (env: PhoneEnv): string => {
  const base = (env.FRONTEND_BASE_URL ?? "").replace(/\/$/, "");
  const secret = env.VOICE_WEBHOOK_SECRET ?? "";
  if (base.length === 0 || secret.length === 0) {
    return "";
  }
  return `${base}/api/voice/bolna/webhook?k=${encodeURIComponent(secret)}`;
};

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
  return bolnaCarrier({ apiKey: key, webhookUrl: bolnaWebhookUrl(env) });
};

const calleeFromBrief = (brief: Readonly<Record<string, string>>): string | null => {
  for (const key of ["phone", "callee", "to", "number"]) {
    const value = brief[key]?.trim();
    if (value !== undefined && isE164(value)) {
      return value;
    }
  }
  return null;
};

const briefText = (brief: Readonly<Record<string, string>>): string =>
  Object.entries(brief)
    .flatMap(([key, value]) => {
      const trimmed = value.trim();
      return trimmed.length === 0
        ? []
        : [`${key.replace(/_/g, " ")}: ${trimmed}`];
    })
    .join("\n");

const skipMessage: Readonly<Record<string, string>> = {
  no_callee: "No call was placed because the brief has no number to call.",
  no_carrier_configured:
    "No call was placed because that number is not in a market we can call yet.",
  no_consent:
    "No call was placed because the number has not agreed to be called.",
  on_dnc: "No call was placed because the number asked not to be called.",
  outside_calling_window:
    "No call was placed because the market's calling window is closed. It retries when the window opens.",
  budget_too_small:
    "No call was placed because the shift budget cannot cover a minute.",
};

export interface PhoneHireInput {
  readonly sessionId: string;
  readonly agentName: string;
  readonly manifest: {
    readonly phone?: { readonly outbound: boolean; readonly inbound: boolean; readonly script: string };
  };
  readonly brief: Readonly<Record<string, string>>;
  readonly budgetRemainingKobo: number;
}

const retryDelayMs = (reason: string): number => {
  if (reason === "outside_calling_window") {
    return 900_000;
  }
  if (skipMessage[reason] !== undefined) {
    return 86_400_000;
  }
  return 300_000;
};

const reportSkip = (
  db: DatabaseImpl,
  sessionId: string,
  reason: string,
  at: Date,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const transport = yield* db
      .first(
        "SELECT id AS id FROM session_transports WHERE session_id = ? AND type = 'phone_out' AND carrier_ref IS NULL LIMIT 1",
        [sessionId],
      )
      .pipe(Effect.orDie);
    if (transport === null) {
      return;
    }
    yield* deferTransport(
      db,
      sessionId,
      new Date(at.getTime() + retryDelayMs(reason)).toISOString(),
    );
    yield* fileCallReport(db, sessionId, String(transport.id), {
      outcome: "failed",
      summary: skipMessage[reason] ?? `No call was placed: ${reason}`,
      stats: [],
    });
  });

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
    const bound = yield* db
      .first(
        "SELECT id AS id FROM session_transports WHERE session_id = ? AND type = 'phone_out' AND carrier_ref IS NOT NULL LIMIT 1",
        [input.sessionId],
      )
      .pipe(Effect.orDie);
    if (bound !== null) {
      return skip("already_dialed");
    }
    const callee = calleeFromBrief(input.brief);
    if (callee === null) {
      yield* reportSkip(db, input.sessionId, "no_callee", at);
      return skip("no_callee");
    }
    const market = marketForNumber(callee);
    if (market === null) {
      yield* reportSkip(db, input.sessionId, "no_carrier_configured", at);
      return skip("no_carrier_configured");
    }
    const carrier = carrierForMarket(env, market);
    if (carrier === null) {
      yield* reportSkip(db, input.sessionId, "no_carrier_configured", at);
      return skip("no_carrier_configured");
    }
    const claimed = yield* claimDial(db, input.sessionId, at);
    if (!claimed) {
      return skip("dial_in_flight");
    }
    const result = yield* dialChecked(db, carrier, {
      sessionId: input.sessionId,
      to: callee,
      market,
      agentName: input.agentName,
      script: phone.script,
      brief: briefText(input.brief),
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
      yield* reportSkip(db, input.sessionId, result.reason, at);
      return skip(result.reason);
    }
    const transport = yield* db
      .first(
        "SELECT id AS id FROM session_transports WHERE session_id = ? AND carrier_ref = ? AND type = 'phone_out' LIMIT 1",
        [input.sessionId, result.handle.carrierRef],
      )
      .pipe(Effect.orDie);
    if (transport !== null) {
      yield* fileCallReport(db, input.sessionId, String(transport.id), {
        outcome: "complete",
        summary: `Call placed to ${callee} through ${result.handle.carrier}.`,
        stats: [{ label: "number", value: callee }],
      });
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
