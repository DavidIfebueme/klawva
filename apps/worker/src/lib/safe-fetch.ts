import * as Effect from "effect/Effect";
import { isBlockedHost } from "./ip-guard.ts";

export { isBlockedHost };

export interface FetchPolicy {
  readonly purpose: "card" | "evidence";
  /** default true. tests and offline callers can disable the dns-over-https guard. */
  readonly resolveDns?: boolean;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly maxRedirects?: number;
}

export type FetchOutcome =
  | {
      readonly ok: true;
      readonly status: number;
      readonly body: string;
      readonly contentType: string;
      readonly url: string;
    }
  | { readonly ok: false; readonly reason: string; readonly status: number };

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export const PLATFORM_FETCH_LIMITS = {
  maxBytes: 1_048_576,
  timeoutMs: 5_000,
  maxRedirects: 3,
} as const;

const effective = (policy: FetchPolicy) => ({
  maxBytes: Math.min(policy.maxBytes ?? PLATFORM_FETCH_LIMITS.maxBytes, PLATFORM_FETCH_LIMITS.maxBytes),
  timeoutMs: Math.min(policy.timeoutMs ?? PLATFORM_FETCH_LIMITS.timeoutMs, PLATFORM_FETCH_LIMITS.timeoutMs),
  maxRedirects: Math.min(
    policy.maxRedirects ?? PLATFORM_FETCH_LIMITS.maxRedirects,
    PLATFORM_FETCH_LIMITS.maxRedirects,
  ),
});

export const checkUrl = (
  raw: string,
  policy: Pick<FetchPolicy, "purpose">,
):
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: string } => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "url_unparseable" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "scheme_not_allowed" };
  }
  if (policy.purpose === "card" && url.protocol !== "https:") {
    return { ok: false, reason: "card_requires_https" };
  }
  if (url.protocol === "http:" && url.port !== "" && url.port !== "80") {
    return { ok: false, reason: "port_not_allowed" };
  }
  if (url.protocol === "https:" && url.port !== "" && url.port !== "443") {
    return { ok: false, reason: "port_not_allowed" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "credentials_in_url" };
  }
  if (isBlockedHost(url.hostname)) {
    return { ok: false, reason: "host_not_allowed" };
  }
  return { ok: true, url };
};

/**
 * resolves a hostname through dns-over-https and refuses when any answer is a
 * private address. workers has no resolver, so this is the closest thing to
 * pinning we can do: the fetch still resolves independently afterwards, which is
 * why the module comment calls this a raised bar, not a guarantee.
 */
export const resolvesPublicly = async (
  hostname: string,
  fetchImpl: FetchImpl,
  timeoutMs = 3_000,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { accept: "application/dns-json" }, signal: controller.signal },
    );
    if (!response.ok) {
      return { ok: false, reason: "doh_failed" };
    }
    const body = (await response.json()) as { Answer?: ReadonlyArray<{ data?: string }> };
    const answers = (body.Answer ?? [])
      .map((answer) => answer.data ?? "")
      .filter((data) => data.length > 0);
    if (answers.length === 0) {
      return { ok: false, reason: "no_answer" };
    }
    for (const address of answers) {
      if (isBlockedHost(address)) {
        return { ok: false, reason: "resolves_private" };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "doh_failed" };
  } finally {
    clearTimeout(timer);
  }
};

const readCapped = async (
  response: Response,
  maxBytes: number,
): Promise<string | null> => {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    return null;
  }
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done === true) {
      break;
    }
    size += next.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(next.value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
};

const follow = async (
  start: URL,
  policy: FetchPolicy,
  init: RequestInit,
  fetchImpl: FetchImpl,
): Promise<FetchOutcome> => {
  const limits = effective(policy);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
  try {
    let current = start;
    for (let hop = 0; hop <= limits.maxRedirects; hop++) {
      const response = await fetchImpl(current.toString(), {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location === null) {
          return { ok: false, reason: "redirect_without_location", status: response.status };
        }
        const next = checkUrl(new URL(location, current).toString(), policy);
        if (!next.ok) {
          return { ok: false, reason: `redirect_${next.reason}`, status: response.status };
        }
        current = next.url;
        continue;
      }
      const body = await readCapped(response, limits.maxBytes);
      if (body === null) {
        return { ok: false, reason: "body_too_large", status: response.status };
      }
      if (response.status < 200 || response.status >= 300) {
        return { ok: false, reason: `status_${response.status}`, status: response.status };
      }
      return {
        ok: true,
        status: response.status,
        body,
        contentType: response.headers.get("content-type") ?? "",
        url: current.toString(),
      };
    }
    return { ok: false, reason: "too_many_redirects", status: 0 };
  } finally {
    clearTimeout(timer);
  }
};

const guarded = (
  raw: string,
  policy: FetchPolicy,
  init: RequestInit,
  fetchImpl: FetchImpl,
): Effect.Effect<FetchOutcome> => {
  const start = checkUrl(raw, policy);
  if (!start.ok) {
    return Effect.succeed({ ok: false as const, reason: start.reason, status: 0 });
  }
  return Effect.tryPromise({
    try: async () => {
      if (policy.resolveDns === false) {
        return follow(start.url, policy, init, fetchImpl);
      }
      const resolved = await resolvesPublicly(start.url.hostname, fetchImpl);
      if (!resolved.ok) {
        return { ok: false as const, reason: resolved.reason, status: 0 };
      }
      return follow(start.url, policy, init, fetchImpl);
    },
    catch: (cause) => new Error(String(cause)),
  }).pipe(
    Effect.catch(() =>
      Effect.succeed({ ok: false as const, reason: "fetch_failed", status: 0 }),
    ),
  );
};

/**
 * fetches an author-supplied url with the cage the plan requires.
 *
 * limitation, stated here because it matters: the workers runtime gives us no
 * resolver, so dns rebinding cannot be fully excluded the way a pinned-address
 * fetcher can. every check below is enforced per hop, and the platform egress
 * rules cover the rest. do not describe this as a guarantee.
 */
export const safeFetch = (
  raw: string,
  policy: FetchPolicy,
  fetchImpl: FetchImpl = (url, init) => fetch(url, init),
): Effect.Effect<FetchOutcome> =>
  guarded(raw, policy, { method: "GET", headers: { "user-agent": "klawva-review/1.0" } }, fetchImpl);

export const safePost = (
  raw: string,
  body: string,
  policy: FetchPolicy,
  headers: Readonly<Record<string, string>> = {},
  fetchImpl: FetchImpl = (url, init) => fetch(url, init),
): Effect.Effect<FetchOutcome> =>
  guarded(
    raw,
    policy,
    {
      method: "POST",
      headers: { "user-agent": "klawva-review/1.0", ...headers },
      body,
    },
    fetchImpl,
  );
