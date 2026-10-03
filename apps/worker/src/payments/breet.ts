import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";

export class BreetError extends Schema.TaggedError<BreetError>()("BreetError", {
  reason: Schema.String,
}) {}

export const BreetWebhook = Schema.Struct({
  event: Schema.String,
  eventId: Schema.optionalKey(Schema.String),
  eventTime: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.String),
  amountInUSD: Schema.optionalKey(Schema.Number),
  destinationAddress: Schema.optionalKey(Schema.String),
});
export type BreetWebhook = typeof BreetWebhook.Type;

export const verifyWebhook = (
  provided: string | null,
  secret: string,
): boolean => secret.length > 0 && provided === secret;

export const parseWebhook = (
  raw: string,
): Effect.Effect<BreetWebhook, BreetError> =>
  Effect.try({
    try: () =>
      Schema.decodeUnknownSync(Schema.fromJsonString(BreetWebhook))(raw),
    catch: (cause) => new BreetError({ reason: String(cause) }),
  });

const baseUrl = "https://api.breet.io/v1";

const headers = (env: Env): Record<string, string> => ({
  "x-app-id": env.BREET_APP_ID,
  "x-app-secret": env.BREET_APP_SECRET,
  "X-Breet-Env": env.BREET_ENV,
  "Content-Type": "application/json",
});

export const generateAddress = (
  env: Env,
  db: DatabaseImpl,
  sessionId: string,
  asset: string,
): Effect.Effect<string, BreetError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(
          `${baseUrl}/trades/sell/assets/${asset}/generate-address`,
          {
            method: "POST",
            headers: headers(env),
            body: JSON.stringify({ label: sessionId }),
          },
        ),
      catch: (cause) => new BreetError({ reason: String(cause) }),
    });
    const body = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) => new BreetError({ reason: String(cause) }),
    });
    const decoded = Schema.decodeUnknownOption(
      Schema.Struct({
        data: Schema.optionalKey(
          Schema.Struct({ address: Schema.optionalKey(Schema.String) }),
        ),
      }),
    )(body);
    const address =
      decoded._tag === "Some" ? decoded.value.data?.address ?? "" : "";
    if (address.length === 0) {
      return yield* Effect.fail(
        new BreetError({ reason: "breet_address_missing" }),
      );
    }
    yield* db
      .run(
        "INSERT INTO breet_addresses (address, session_id, asset, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(address) DO UPDATE SET session_id = excluded.session_id",
        [address, sessionId, asset, new Date().toISOString()],
      )
      .pipe(Effect.orDie);
    return address;
  });

export const handleBreetWebhook = (
  request: Request,
  env: Env,
  db: DatabaseImpl,
): Effect.Effect<Response, BreetError> =>
  Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => request.text(),
      catch: (cause) => new BreetError({ reason: String(cause) }),
    });
    if (!verifyWebhook(request.headers.get("x-webhook-secret"), env.BREET_WEBHOOK_SECRET)) {
      return Response.json({ ok: false }, { status: 401 });
    }
    const event = yield* parseWebhook(raw);
    if (event.event !== "trade.completed" || event.destinationAddress === undefined) {
      return Response.json({ ok: true });
    }
    const mapping = yield* db
      .first("SELECT session_id AS sessionId FROM breet_addresses WHERE address = ?", [
        event.destinationAddress,
      ])
      .pipe(Effect.orDie);
    if (mapping === null) {
      return Response.json({ ok: true });
    }
    const sessionId = String(mapping.sessionId);
    const amountMinor = Math.round((event.amountInUSD ?? 0) * 100);
    if (amountMinor > 0) {
      yield* Effect.tryPromise({
        try: () =>
          env.WALLET.get(env.WALLET.idFromName(sessionId)).fetch(
            "https://wallet/credit",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                amountMinor,
                reference: `breet_${event.eventId ?? event.destinationAddress}`,
                description: "Crypto funding",
              }),
            },
          ),
        catch: (cause) => new BreetError({ reason: String(cause) }),
      }).pipe(Effect.orDie);
    }
    return Response.json({ ok: true });
  });
