import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export interface RateLimiter {
  readonly limit: (options: { key: string }) => Promise<{ success: boolean }>;
}

export const rateLimited = (
  limiter: RateLimiter,
  key: string,
): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: () => limiter.limit({ key }),
    catch: (cause) => new Error(String(cause)),
  }).pipe(
    Effect.map((result) => result.success),
    Effect.catch(() => Effect.succeed(true)),
  );

export const verifyTurnstile = (
  secret: string,
  token: string | undefined,
): Effect.Effect<boolean> => {
  if (secret.length === 0) {
    return Effect.succeed(true);
  }
  if (token === undefined || token.length === 0) {
    return Effect.succeed(false);
  }
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret, response: token }),
        },
      );
      const body: unknown = await response.json();
      const decoded = Schema.decodeUnknownOption(
        Schema.Struct({ success: Schema.Boolean }),
      )(body);
      return decoded._tag === "Some" ? decoded.value.success : false;
    },
    catch: (cause) => new Error(String(cause)),
  }).pipe(Effect.catch(() => Effect.succeed(false)));
};
