import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class FetchError extends Schema.TaggedError<FetchError>()("FetchError", {
  url: Schema.String,
  reason: Schema.String,
}) {}

export class BlockedHost extends Schema.TaggedError<BlockedHost>()(
  "BlockedHost",
  {
    host: Schema.String,
  },
) {}

const privatePatterns = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^169\.254\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

export const isBlockedHost = (host: string): boolean =>
  privatePatterns.some((pattern) => pattern.test(host)) ||
  host.endsWith(".internal") ||
  host.endsWith(".local");

export const maxResponseBytes = 1_000_000;

export const fetchUrl = (
  raw: string,
): Effect.Effect<string, FetchError | BlockedHost> =>
  Effect.gen(function* () {
    const url = yield* Effect.try({
      try: () => new URL(raw),
      catch: () => new FetchError({ url: raw, reason: "invalid_url" }),
    });
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return yield* Effect.fail(
        new FetchError({ url: raw, reason: "unsupported_protocol" }),
      );
    }
    if (isBlockedHost(url.hostname)) {
      return yield* Effect.fail(new BlockedHost({ host: url.hostname }));
    }
    return yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, { redirect: "follow" });
        const text = await response.text();
        return text.slice(0, maxResponseBytes);
      },
      catch: (cause) => new FetchError({ url: raw, reason: String(cause) }),
    });
  });
