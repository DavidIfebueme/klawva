import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { constantTimeEqual } from "../lib/secure.ts";

export class AuthError extends Schema.TaggedError<AuthError>()(
  "AuthError",
  { reason: Schema.String },
  { httpApiStatus: 401 },
) {}

export const TokenPayload = Schema.Struct({
  email: Schema.String,
  exp: Schema.Number,
  scope: Schema.String,
});
export type TokenPayload = typeof TokenPayload.Type;

const encodeBase64Url = (value: string): string =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const decodeBase64Url = (value: string): string =>
  atob(
    value.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (value.length % 4)) % 4),
  );

const hmacHex = (
  secret: string,
  message: string,
): Effect.Effect<string, AuthError> =>
  Effect.tryPromise({
    try: async () => {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(message),
      );
      return Array.from(new Uint8Array(signature))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    },
    catch: (cause) => new AuthError({ reason: String(cause) }),
  });

export const signToken = (
  secret: string,
  payload: TokenPayload,
): Effect.Effect<string, AuthError> =>
  Effect.gen(function* () {
    const body = encodeBase64Url(JSON.stringify(payload));
    const signature = yield* hmacHex(secret, body);
    return `${body}.${signature}`;
  });

export const verifyToken = (
  secret: string,
  token: string,
): Effect.Effect<TokenPayload, AuthError> =>
  Effect.gen(function* () {
    const parts = token.split(".");
    if (parts.length !== 2) {
      return yield* Effect.fail(new AuthError({ reason: "malformed_token" }));
    }
    const [body, signature] = parts;
    const expected = yield* hmacHex(secret, body);
    if (!constantTimeEqual(expected, signature)) {
      return yield* Effect.fail(new AuthError({ reason: "bad_signature" }));
    }
    const decoded = yield* Effect.try({
      try: () => {
        const parsed: unknown = JSON.parse(decodeBase64Url(body));
        return Schema.decodeUnknownOption(TokenPayload)(parsed);
      },
      catch: () => new AuthError({ reason: "bad_payload" }),
    });
    if (decoded._tag === "None") {
      return yield* Effect.fail(new AuthError({ reason: "bad_payload" }));
    }
    if (decoded.value.exp < Math.floor(Date.now() / 1000)) {
      return yield* Effect.fail(new AuthError({ reason: "expired_token" }));
    }
    return decoded.value;
  });
