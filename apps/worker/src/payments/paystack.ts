import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { windowEndFor } from "./pricing.ts";
import type { DatabaseImpl } from "../db/database.ts";
import { sendEmail } from "../email/brevo.ts";
import { shiftStartedEmail } from "../email/templates.ts";
import type { Env } from "../env.ts";
import { constantTimeEqual } from "../lib/secure.ts";

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

export const verifySignature = (
  rawBody: string,
  secret: string,
  provided: string,
): Effect.Effect<boolean, PaystackError> =>
  signBody(rawBody, secret).pipe(
    Effect.map((expected) => constantTimeEqual(expected, provided)),
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
  duration_days: Schema.optionalKey(Schema.Number),
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
    if (secret.length === 0) {
      return Response.json({ ok: false }, { status: 401 });
    }
    const valid = yield* verifySignature(rawBody, secret, signature);
    if (!valid) {
      return Response.json({ ok: false }, { status: 401 });
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
        "SELECT p.session_id AS session_id, p.amount_minor AS amount_minor, p.status AS status, s.duration_days AS duration_days FROM payments p JOIN sessions s ON s.id = p.session_id WHERE p.provider_reference = ?",
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
    const endIso = windowEndFor(Date.now(), Number(decoded.duration_days ?? 1));
    const confirmed = yield* db
      .first(
        "UPDATE payments SET status = 'confirmed', confirmed_at = ? WHERE provider_reference = ? AND status = 'pending' RETURNING id AS id",
        [now, reference],
      )
      .pipe(Effect.orDie);
    if (confirmed === null) {
      return Response.json({ ok: true });
    }
    yield* db
      .run(
        "UPDATE sessions SET state = 'provisioning', window_start = ?, window_end = ?, updated_at = ? WHERE id = ?",
        [now, endIso, now, decoded.session_id],
      )
      .pipe(Effect.orDie);
    const activated = yield* Effect.tryPromise({
      try: () =>
        env.SESSION.get(env.SESSION.idFromName(decoded.session_id)).fetch(
          "https://session/activate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ windowEnd: endIso }),
          },
        ),
      catch: (cause) => new PaystackError({ reason: String(cause) }),
    }).pipe(Effect.catch(() => Effect.void));
    if (activated !== undefined) {
      yield* db
        .run(
          "UPDATE sessions SET state = 'active', updated_at = ? WHERE id = ?",
          [new Date().toISOString(), decoded.session_id],
        )
        .pipe(Effect.orDie);
    }
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
    const sessionRow = yield* db
      .first(
        "SELECT customer_email AS email, listing_id AS listingId FROM sessions WHERE id = ?",
        [decoded.session_id],
      )
      .pipe(Effect.orDie);
    if (sessionRow !== null && sessionRow.email !== null) {
      const listingRow = yield* db
        .first("SELECT name AS name FROM agent_listings WHERE id = ?", [
          String(sessionRow.listingId),
        ])
        .pipe(Effect.orDie);
      const employeeName =
        listingRow !== null ? String(listingRow.name) : "Your Klawva employee";
      yield* sendEmail({
        apiKey: env.BREVO_API_KEY,
        senderEmail: env.BREVO_SENDER_EMAIL,
        senderName: "Klawva",
        toEmail: String(sessionRow.email),
        subject: "Your Klawva employee is now active",
        html: shiftStartedEmail(employeeName, now, endIso),
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => console.error("shift_email_failed", error)),
        ),
      );
    }
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
      const separator = params.callbackUrl.includes("?") ? "&" : "?";
      return {
        reference,
        checkoutUrl: `${params.callbackUrl}${separator}reference=${reference}&dev=1`,
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
