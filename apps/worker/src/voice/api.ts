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
import { fileCallReport } from "../report/report.ts";

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

const bolnaWebhook = HttpApiEndpoint.post(
  "bolnaWebhook",
  "/api/voice/bolna/webhook",
  {
    payload: Schema.Struct({
      carrierRef: Schema.optionalKey(Schema.String),
      execution_id: Schema.optionalKey(Schema.String),
      summary: Schema.optionalKey(Schema.String),
      transcript: Schema.optionalKey(Schema.String),
    }),
    success: Schema.Struct({ ok: Schema.Boolean }),
    error: AuthError,
  },
);

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
          const secret = request.headers["x-webhook-secret"];
          if (typeof secret !== "string" || secret !== env.CRON_SECRET) {
            return yield* Effect.fail(new AuthError({ reason: "missing_token" }));
          }
          const carrierRef = payload.carrierRef ?? payload.execution_id;
          if (carrierRef === undefined) {
            return yield* Effect.fail(new AuthError({ reason: "missing_ref" }));
          }
          const summary =
            payload.summary ??
            (payload.transcript !== undefined && payload.transcript.length > 0
              ? payload.transcript.slice(0, 500)
              : "call completed");
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
