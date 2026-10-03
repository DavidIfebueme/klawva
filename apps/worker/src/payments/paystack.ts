import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";

export class PaystackError extends Schema.TaggedError<PaystackError>()(
  "PaystackError",
  {
    reason: Schema.String,
  },
) {}

export const signBody = (
  rawBody: string,
  secret: string,
): Effect.Effect<string, PaystackError> =>
  Effect.tryPromise({
    try: async () => {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-512" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(rawBody),
      );
      return Array.from(new Uint8Array(signature))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    },
    catch: (cause) => new PaystackError({ reason: String(cause) }),
  });

export const timingSafeEqual = (left: string, right: string): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index++) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
};

export const verifySignature = (
  rawBody: string,
  secret: string,
  provided: string,
): Effect.Effect<boolean, PaystackError> =>
  signBody(rawBody, secret).pipe(
    Effect.map((expected) => timingSafeEqual(expected, provided)),
  );

const PaystackEvent = Schema.Struct({
  event: Schema.optionalKey(Schema.String),
  data: Schema.optionalKey(
    Schema.Struct({
      reference: Schema.optionalKey(Schema.String),
      amount: Schema.optionalKey(Schema.Number),
    }),
  ),
});

const PaymentRow = Schema.Struct({
  session_id: Schema.String,
  amount_minor: Schema.Number,
  status: Schema.String,
});

export const handlePaystackWebhook = (
  request: Request,
  env: Env,
  db: DatabaseImpl,
): Effect.Effect<Response, PaystackError> =>
  Effect.gen(function* () {
    const rawBody = yield* Effect.tryPromise({
      try: () => request.text(),
      catch: (cause) => new PaystackError({ reason: String(cause) }),
    });
    const signature = request.headers.get("x-paystack-signature") ?? "";
    const secret = env.PAYSTACK_SECRET_KEY;
    if (secret.length > 0) {
      const valid = yield* verifySignature(rawBody, secret, signature);
      if (!valid) {
        return Response.json({ ok: false }, { status: 401 });
      }
    }
    const parsed = yield* Effect.try({
      try: () => {
        const value: unknown = JSON.parse(rawBody);
        return Schema.decodeUnknownOption(PaystackEvent)(value);
      },
      catch: () => new PaystackError({ reason: "invalid_json" }),
    });
    if (parsed._tag === "None") {
      return Response.json({ ok: true });
    }
    const reference = parsed.value.data?.reference;
    if (parsed.value.event !== "charge.success" || reference === undefined) {
      return Response.json({ ok: true });
    }
    const payment = yield* db
      .first(
        "SELECT session_id AS session_id, amount_minor AS amount_minor, status AS status FROM payments WHERE provider_reference = ?",
        [reference],
      )
      .pipe(Effect.orDie);
    if (payment === null) {
      return Response.json({ ok: true });
    }
    const decoded = Schema.decodeUnknownSync(PaymentRow)(payment);
    if (decoded.status === "confirmed") {
      return Response.json({ ok: true });
    }
    const now = new Date().toISOString();
    yield* db
      .run(
        "UPDATE payments SET status = 'confirmed', confirmed_at = ? WHERE provider_reference = ?",
        [now, reference],
      )
      .pipe(Effect.orDie);
    yield* db
      .run("UPDATE sessions SET state = 'ready', updated_at = ? WHERE id = ?", [
        now,
        decoded.session_id,
      ])
      .pipe(Effect.orDie);
    yield* Effect.tryPromise({
      try: () =>
        env.WALLET.get(env.WALLET.idFromName(decoded.session_id)).fetch(
          "https://wallet/credit",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amountMinor: decoded.amount_minor,
              reference: `checkout_${reference}`,
              description: "Checkout payment",
            }),
          },
        ),
      catch: (cause) => new PaystackError({ reason: String(cause) }),
    });
    return Response.json({ ok: true });
  });

export const initializePayment = (params: {
  readonly secret: string;
  readonly sessionId: string;
  readonly amountMinor: number;
  readonly callbackUrl: string;
  readonly email: string;
}): Effect.Effect<{ reference: string; checkoutUrl: string }, PaystackError> =>
  Effect.gen(function* () {
    const reference = `klawva_${params.sessionId}_${Date.now()}`;
    if (params.secret.length === 0) {
      return {
        reference,
        checkoutUrl: `${params.callbackUrl}?reference=${reference}&dev=1`,
      };
    }
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: params.email,
            amount: params.amountMinor,
            reference,
            callback_url: params.callbackUrl,
          }),
        }),
      catch: (cause) => new PaystackError({ reason: String(cause) }),
    });
    const body = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) => new PaystackError({ reason: String(cause) }),
    });
    const decoded = Schema.decodeUnknownOption(
      Schema.Struct({
        data: Schema.optionalKey(
          Schema.Struct({
            authorization_url: Schema.optionalKey(Schema.String),
          }),
        ),
      }),
    )(body);
    if (decoded._tag === "None") {
      return yield* Effect.fail(
        new PaystackError({ reason: "paystack_initialize_failed" }),
      );
    }
    return { reference, checkoutUrl: decoded.value.data?.authorization_url ?? "" };
  });
