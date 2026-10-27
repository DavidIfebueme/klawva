import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { isBlockedHost } from "../lib/ip-guard.ts";

export { isBlockedHost };

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

export const maxResponseBytes = 1_000_000;
const fetchTimeoutMs = 10_000;
export const maxExtractLinks = 50;
export const maxRedirects = 3;

const redirectStatuses: ReadonlySet<number> = new Set([
  301, 302, 303, 307, 308,
]);

const checkHost = (
  raw: string,
  hostname: string,
): Effect.Effect<void, FetchError | BlockedHost> =>
  isBlockedHost(hostname)
    ? Effect.fail(new BlockedHost({ host: hostname }))
    : Effect.void;

const parseHttpUrl = (
  raw: string,
): Effect.Effect<URL, FetchError> =>
  Effect.gen(function* () {
    const url = yield* Effect.try({
      try: () => URL.parse(raw),
      catch: () => null,
    }).pipe(
      Effect.orElseSucceed(() => null),
      Effect.flatMap((parsed) =>
        parsed === null
          ? Effect.fail(new FetchError({ url: raw, reason: "invalid_url" }))
          : Effect.succeed(parsed),
      ),
    );
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return yield* Effect.fail(
        new FetchError({ url: raw, reason: "unsupported_protocol" }),
      );
    }
    return url;
  });

export type Fetcher = (
  url: URL,
  init: { redirect: "manual"; signal: AbortSignal },
) => Promise<Response>;

export const safeFetch = (
  start: URL,
  raw: string,
  fetcher: Fetcher = fetch,
): Effect.Effect<Response, FetchError | BlockedHost> =>
  Effect.gen(function* () {
    const signal = AbortSignal.timeout(fetchTimeoutMs);
    let current = start;
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      yield* checkHost(raw, current.hostname);
      const response = yield* Effect.tryPromise({
        try: () => fetcher(current, { redirect: "manual", signal }),
        catch: (cause) => new FetchError({ url: raw, reason: String(cause) }),
      });
      const location =
        redirectStatuses.has(response.status) === true
          ? response.headers.get("location")
          : null;
      if (location === null) {
        return response;
      }
      const next = URL.parse(location, current.toString());
      if (next === null) {
        return yield* Effect.fail(
          new FetchError({ url: raw, reason: "invalid_redirect" }),
        );
      }
      if (next.protocol !== "https:" && next.protocol !== "http:") {
        return yield* Effect.fail(
          new FetchError({ url: raw, reason: "unsupported_protocol" }),
        );
      }
      current = next;
    }
    return yield* Effect.fail(
      new FetchError({ url: raw, reason: "too_many_redirects" }),
    );
  });

const decodeEntities = (text: string): string =>
  text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&");

export const toText = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(decodeEntities)
    .join(" ");

const readCapped = (
  response: Response,
  cap: number,
): Effect.Effect<string, FetchError> =>
  Effect.gen(function* () {
    if (response.body === null) {
      return "";
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < cap) {
      const next = yield* Effect.tryPromise({
        try: () => reader.read(),
        catch: (cause) => new FetchError({ url: "", reason: String(cause) }),
      });
      if (next.done === true) {
        break;
      }
      chunks.push(next.value);
      size += next.value.byteLength;
    }
    yield* Effect.promise(() => reader.cancel());
    const joined = new Uint8Array(Math.min(size, cap));
    let offset = 0;
    for (const chunk of chunks) {
      const room = joined.length - offset;
      if (room <= 0) break;
      const slice = chunk.byteLength <= room ? chunk : chunk.slice(0, room);
      joined.set(slice, offset);
      offset += slice.byteLength;
    }
    return new TextDecoder().decode(joined);
  });

const readBody = (
  response: Response,
  raw: string,
): Effect.Effect<string, FetchError> =>
  readCapped(response, maxResponseBytes);

export const fetchUrl = (
  raw: string,
  fetcher?: Fetcher,
): Effect.Effect<string, FetchError | BlockedHost> =>
  Effect.gen(function* () {
    const url = yield* parseHttpUrl(raw);
    const response = yield* safeFetch(url, raw, fetcher);
    const body = yield* readBody(response, raw);
    const contentType = response.headers.get("content-type") ?? "";
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
  const base = URL.parse(baseUrl);
  if (base === null) {
    return [];
  }
  for (const tag of hrefs) {
    const match = /href\s*=\s*["']([^"']+)["']/i.exec(tag);
    const href = match?.[1];
    if (href === undefined || href.length === 0) {
      continue;
    }
    const resolved = URL.parse(href, base.toString());
    if (resolved === null) {
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
  fetcher?: Fetcher,
): Effect.Effect<ReadonlyArray<string>, FetchError | BlockedHost> =>
  Effect.gen(function* () {
    const url = yield* parseHttpUrl(raw);
    const response = yield* safeFetch(url, raw, fetcher);
    const body = yield* readBody(response, raw);
    return extractLinks(body, response.url);
  });
export class SearchError extends Schema.TaggedError<SearchError>()(
  "SearchError",
  {
    reason: Schema.String,
  },
) {}

const braveEndpoint = "https://api.search.brave.com/res/v1/web/search";

export const maxSearchResults = 5;
export const maxSearchChars = 2000;
export const maxQueryChars = 300;

const BraveResult = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
});

const BraveResponse = Schema.Struct({
  web: Schema.optionalKey(
    Schema.Struct({
      results: Schema.optionalKey(Schema.Array(BraveResult)),
    }),
  ),
});

export type SearchFetcher = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

export const webSearch = (
  query: string,
  braveKey: string,
  fetcher?: SearchFetcher,
): Effect.Effect<string, SearchError> =>
  Effect.gen(function* () {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return yield* Effect.fail(new SearchError({ reason: "empty_query" }));
    }
    if (trimmed.length > maxQueryChars) {
      return yield* Effect.fail(new SearchError({ reason: "query_too_long" }));
    }
    if (braveKey.length === 0) {
      return "web search is not configured on this employee. Ask the user for a URL and use fetch_url instead.";
    }
    const run: SearchFetcher =
      fetcher ??
      ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(fetchTimeoutMs) }));
    const target = `${braveEndpoint}?q=${encodeURIComponent(trimmed)}&count=${maxSearchResults}`;
    const response = yield* Effect.tryPromise({
      try: () =>
        run(target, {
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": braveKey,
          },
          signal: AbortSignal.timeout(fetchTimeoutMs),
        }),
      catch: (cause) => new SearchError({ reason: String(cause) }),
    });
    if (!response.ok) {
      return yield* Effect.fail(
        new SearchError({ reason: `search_${response.status}` }),
      );
    }
    const body: unknown = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) => new SearchError({ reason: String(cause) }),
    });
    const decoded = Schema.decodeUnknownOption(BraveResponse)(body);
    if (decoded._tag === "None") {
      return yield* Effect.fail(new SearchError({ reason: "bad_response" }));
    }
    const results = decoded.value.web?.results ?? [];
    if (results.length === 0) {
      return "no results found";
    }
    const lines = results.slice(0, maxSearchResults).map((result) => {
      const title = result.title ?? "untitled";
      const url = result.url ?? "";
      const description = result.description ?? "";
      return `${title} — ${url}\n${description}`;
    });
    return lines.join("\n\n").slice(0, maxSearchChars);
  });
