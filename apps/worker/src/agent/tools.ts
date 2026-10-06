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

const ipv4Octets = (host: string): ReadonlyArray<number> | null => {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number(part) : Number.NaN,
  );
  return octets.every((n) => Number.isInteger(n) && n <= 255) ? octets : null;
};

const isBlockedIpv4 = (octets: ReadonlyArray<number>): boolean => {
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const embeddedIpv4 = (groups: ReadonlyArray<number>): ReadonlyArray<number> => [
  groups[6] >> 8,
  groups[6] & 0xff,
  groups[7] >> 8,
  groups[7] & 0xff,
];

const parseHextets = (part: string): ReadonlyArray<number> | null =>
  part === ""
    ? []
    : part.split(":").map((group) =>
        /^[0-9a-f]{1,4}$/.test(group)
          ? Number.parseInt(group, 16)
          : Number.NaN,
      );

const ipv6Groups = (host: string): ReadonlyArray<number> | null => {
  const text = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (!text.includes(":")) {
    return null;
  }
  const dotted = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(text);
  let head = text;
  let tail: ReadonlyArray<number> = [];
  if (dotted?.[1] !== undefined) {
    const octets = ipv4Octets(dotted[1]);
    if (octets === null) {
      return null;
    }
    tail = [
      (octets[0] << 8) | octets[1],
      (octets[2] << 8) | octets[3],
    ];
    head = text.slice(0, text.length - dotted[1].length).replace(/:$/, "");
  }
  const halves = head.split("::");
  if (halves.length > 2) {
    return null;
  }
  const leading = parseHextets(halves[0] ?? "");
  const trailing =
    halves.length === 2 ? parseHextets(halves[1] ?? "") : ([] as const);
  if (leading === null || trailing === null) {
    return null;
  }
  const known = leading.length + trailing.length + tail.length;
  const groups =
    halves.length === 2
      ? [...leading, ...new Array<number>(8 - known).fill(0), ...trailing, ...tail]
      : [...leading, ...tail];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g))
    ? groups
    : null;
};

const isZeroThrough = (groups: ReadonlyArray<number>, end: number): boolean =>
  groups.slice(0, end).every((group) => group === 0);

const isBlockedIpv6 = (groups: ReadonlyArray<number>): boolean => {
  if (isZeroThrough(groups, 5) && groups[5] === 0xffff) {
    return isBlockedIpv4(embeddedIpv4(groups));
  }
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) {
    return isBlockedIpv4(embeddedIpv4(groups));
  }
  if (groups.every((group) => group === 0)) {
    return true;
  }
  if (isZeroThrough(groups, 7) && groups[7] === 1) {
    return true;
  }
  return (
    (groups[0] & 0xffc0) === 0xfe80 ||
    (groups[0] & 0xfe00) === 0xfc00 ||
    (groups[0] & 0xff00) === 0xff00
  );
};

const blockedSuffixes = [".localhost", ".internal", ".local"];

export const isBlockedHost = (rawHost: string): boolean => {
  const host = rawHost.toLowerCase();
  if (host === "localhost" || blockedSuffixes.some((s) => host.endsWith(s))) {
    return true;
  }
  const octets = ipv4Octets(host);
  if (octets !== null) {
    return isBlockedIpv4(octets);
  }
  const groups = ipv6Groups(host);
  return groups !== null && isBlockedIpv6(groups);
};

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

const readBody = (
  response: Response,
  raw: string,
): Effect.Effect<string, FetchError> =>
  Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) => new FetchError({ url: raw, reason: String(cause) }),
  }).pipe(Effect.map((text) => text.slice(0, maxResponseBytes)));

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