import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import { identityFromToken, tokenFromHeaders } from "../auth/auth.ts";
import { AuthError } from "../auth/tokens.ts";
import { Database, type DatabaseImpl } from "../db/database.ts";
import { WorkerEnv } from "../env.ts";
import { constantTimeEqual } from "../lib/secure.ts";
import { fileCallReport } from "../report/report.ts";
import { fileInboundCall } from "./inbound.ts";

const ConsentEntry = Schema.Struct({
  number: Schema.String,
  source: Schema.String,
  consentedAt: Schema.String,
});

const voiceConsent = HttpApiEndpoint.post("voiceConsent", "/api/voice/consent", {
  payload: Schema.Struct({ numbers: Schema.Array(ConsentEntry) }),
  success: Schema.Struct({ ok: Schema.Boolean, upserted: Schema.Number }),
  error: AuthError,
});

export const BolnaWebhookPayload = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  carrierRef: Schema.optionalKey(Schema.String),
  execution_id: Schema.optionalKey(Schema.String),
  call_type: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.String),
  summary: Schema.optionalKey(Schema.String),
  transcript: Schema.optionalKey(Schema.String),
  conversation_duration: Schema.optionalKey(Schema.Number),
  telephony_data: Schema.optionalKey(
    Schema.Struct({
      call_type: Schema.optionalKey(Schema.String),
      to_number: Schema.optionalKey(Schema.String),
      from_number: Schema.optionalKey(Schema.String),
    }),
  ),
});

export const bolnaCallType = (payload: {
  readonly call_type?: string;
  readonly telephony_data?: { readonly call_type?: string };
}): string | undefined => payload.call_type ?? payload.telephony_data?.call_type;

const bolnaWebhook = HttpApiEndpoint.post(
  "bolnaWebhook",
  "/api/voice/bolna/webhook",
  {
    payload: BolnaWebhookPayload,
    success: Schema.Struct({ ok: Schema.Boolean }),
    error: AuthError,
  },
);

const terminalCallStatuses = new Set([
  "completed",
  "no-answer",
  "busy",
  "failed",
  "canceled",
  "stopped",
  "error",
  "balance-low",
]);

class VoiceGroup extends HttpApiGroup.make("Voice")
  .add(voiceConsent)
  .add(bolnaWebhook) {}

export class VoiceApi extends HttpApi.make("VoiceApi").add(VoiceGroup) {}

export const upsertConsent = (
  db: DatabaseImpl,
  entry: { readonly number: string; readonly source: string; readonly consentedAt: string },
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO phone_numbers (number, consent_source, consented_at, dnc, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(number) DO UPDATE SET consent_source = excluded.consent_source, consented_at = excluded.consented_at, updated_at = excluded.updated_at",
      [
        entry.number,
        entry.source,
        entry.consentedAt,
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    )
    .pipe(Effect.orDie);

export const fileBolnaReport = (
  db: DatabaseImpl,
  carrierRef: string,
  summary: string,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const transport = yield* db
      .first(
        "SELECT id AS id, session_id AS sessionId FROM session_transports WHERE carrier_ref = ?",
        [carrierRef],
      )
      .pipe(Effect.orDie);
    if (transport === null) {
      return false;
    }
    yield* fileCallReport(
      db,
      String(transport.sessionId),
      String(transport.id),
      { summary, stats: [] },
    );
    return true;
  });

export const voiceGroup = HttpApiBuilder.group(
  VoiceApi,
  "Voice",
  Effect.fn(function* (handlers) {
    const db = yield* Database;
    const env = yield* WorkerEnv;

    const requireIdentity = () =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = tokenFromHeaders(request.headers);
        if (token === null) {
          return yield* Effect.fail(new AuthError({ reason: "missing_token" }));
        }
        return yield* identityFromToken(env, db, token);
      });

    return handlers
      .handle("voiceConsent", ({ payload }) =>
        Effect.gen(function* () {
          yield* requireIdentity();
          for (const entry of payload.numbers) {
            yield* upsertConsent(db, entry);
          }
          return { ok: true, upserted: payload.numbers.length };
        }),
      )
      .handle("bolnaWebhook", ({ payload }) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const header = request.headers["x-webhook-secret"];
          const query = new URL(request.url).searchParams.get("k");
          const secret = typeof header === "string" ? header : query;
          const expected = env.VOICE_WEBHOOK_SECRET ?? env.CRON_SECRET;
          if (secret === null || !constantTimeEqual(secret, expected)) {
            return yield* Effect.fail(new AuthError({ reason: "missing_token" }));
          }
          if (payload.status !== undefined && !terminalCallStatuses.has(payload.status)) {
            return { ok: true };
          }
          if (bolnaCallType(payload) === "inbound") {
            const executionId =
              payload.id ?? payload.execution_id ?? payload.carrierRef;
            const toNumber = payload.telephony_data?.to_number;
            if (executionId === undefined || toNumber === undefined) {
              return { ok: false };
            }
            const filed = yield* fileInboundCall(db, {
              executionId,
              toNumber,
              status: payload.status ?? "completed",
              ...(payload.summary === undefined ? {} : { summary: payload.summary }),
              ...(payload.transcript === undefined
                ? {}
                : { transcript: payload.transcript }),
              ...(payload.conversation_duration === undefined
                ? {}
                : { conversationDuration: payload.conversation_duration }),
            });
            return { ok: filed };
          }
          const carrierRef = payload.id ?? payload.carrierRef ?? payload.execution_id;
          if (carrierRef === undefined) {
            return yield* Effect.fail(new AuthError({ reason: "missing_ref" }));
          }
          const summary =
            payload.summary ??
            (payload.transcript !== undefined && payload.transcript.length > 0
              ? payload.transcript.slice(0, 500)
              : payload.status === "completed" && payload.conversation_duration === 0
                ? "Call completed with no conversation."
                : `Call ${payload.status ?? "completed"}.`);
          const filed = yield* fileBolnaReport(db, carrierRef, summary);
          if (!filed) {
            return yield* Effect.fail(
              new AuthError({ reason: "transport_not_found" }),
            );
          }
          return { ok: true };
        }),
      );
  }),
);
