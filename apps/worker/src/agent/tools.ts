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
const fetchTimeoutMs = 10_000;
export const maxExtractLinks = 50;

const checkHost = (
  raw: string,
  hostname: string,
): Effect.Effect<void, FetchError | BlockedHost> =>
  isBlockedHost(hostname)
    ? Effect.fail(new BlockedHost({ host: hostname }))
    : Effect.void;

export const toText = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();

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
    yield* checkHost(raw, url.hostname);
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, { redirect: "follow", signal: AbortSignal.timeout(fetchTimeoutMs) }),
      catch: (cause) => new FetchError({ url: raw, reason: String(cause) }),
    });
    const finalHost = yield* Effect.try({
      try: () => new URL(response.url).hostname,
      catch: () => new FetchError({ url: raw, reason: "invalid_redirect" }),
    });
    yield* checkHost(raw, finalHost);
    const contentType = response.headers.get("content-type") ?? "";
    const body = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) => new FetchError({ url: raw, reason: String(cause) }),
    }).pipe(Effect.map((text) => text.slice(0, maxResponseBytes)));
    return contentType.includes("text/html") ? toText(body) : body;
  });

export const extractLinks = (
  html: string,
  baseUrl: string,
  limit: number = maxExtractLinks,
): ReadonlyArray<string> => {
  const hrefs = html.match(/<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  for (const tag of hrefs) {
    const match = /href\s*=\s*["']([^"']+)["']/i.exec(tag);
    const href = match?.[1];
    if (href === undefined || href.length === 0) {
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      continue;
    }
    if (resolved.hostname !== base.hostname) {
      continue;
    }
    resolved.hash = "";
    const key = resolved.toString();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
    if (out.length >= limit) {
      break;
    }
  }
  return out;
};

export const fetchLinks = (
  raw: string,
): Effect.Effect<ReadonlyArray<string>, FetchError | BlockedHost> =>
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
    yield* checkHost(raw, url.hostname);
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, { redirect: "follow", signal: AbortSignal.timeout(fetchTimeoutMs) }),
      catch: (cause) => new FetchError({ url: raw, reason: String(cause) }),
    });
    const finalHost = yield* Effect.try({
      try: () => new URL(response.url).hostname,
      catch: () => new FetchError({ url: raw, reason: "invalid_redirect" }),
    });
    yield* checkHost(raw, finalHost);
    const body = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) => new FetchError({ url: raw, reason: String(cause) }),
    }).pipe(Effect.map((text) => text.slice(0, maxResponseBytes)));
    return extractLinks(body, response.url);
  });
