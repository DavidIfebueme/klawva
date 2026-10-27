import { afterEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import { isBlockedHost, safeFetch } from "../src/lib/safe-fetch.ts";

const run = (url: string, purpose: "card" | "evidence" = "evidence") =>
  Effect.runPromise(safeFetch(url, { purpose, resolveDns: false }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("blocked hosts", () => {
  it.each([
    "localhost",
    "api.localhost",
    "printer.local",
    "metadata.google.internal",
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.9",
    "192.168.1.4",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
  ])("blocks %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it.each(["example.com", "api.clicky.dev", "8.8.8.8", "klawva.xyz"])(
    "allows %s",
    (host) => {
      expect(isBlockedHost(host)).toBe(false);
    },
  );
});

describe("safeFetch", () => {
  it("refuses a non-https card url", async () => {
    const outcome = await run("http://author.example/card.json", "card");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("card_requires_https");
  });

  it("refuses a metadata address before any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const outcome = await run("http://169.254.169.254/latest/meta-data");
    expect(outcome.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a redirect into a private address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/admin" },
        }),
      ),
    );
    const outcome = await run("https://author.example/card.json", "card");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("redirect");
  });

  it("follows one safe redirect and returns the body", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? new Response(null, { status: 301, headers: { location: "https://author.example/final" } })
          : new Response("hello", { status: 200 });
      }),
    );
    const outcome = await run("https://author.example/card.json", "card");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.body).toBe("hello");
      expect(outcome.url).toBe("https://author.example/final");
    }
  });

  it("refuses a body above the cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(2048), { status: 200 })),
    );
    const outcome = await Effect.runPromise(
      safeFetch("https://author.example/a", { purpose: "evidence", maxBytes: 1024, resolveDns: false }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("body_too_large");
  });
});

describe("the bypasses the review found", () => {
  it.each([
    "[::ffff:7f00:1]",
    "[fe90::1]",
    "[ff02::1]",
    "[64:ff9b::7f00:1]",
    "198.18.0.1",
    "single-label",
  ])("blocks %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it("a non-2xx is not a resolved url, whatever the body says", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("page", { status: 500 })));
    const outcome = await run("https://author.example/x");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("status_500");
  });

  it("carries the content type so a caller can refuse the wrong one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })),
    );
    const outcome = await run("https://author.example/x");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.contentType).toContain("text/html");
  });

  it("safePost refuses a redirect into a private address too", async () => {
    const { safePost } = await import("../src/lib/safe-fetch.ts");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, { status: 307, headers: { location: "http://10.0.0.5/admin" } }),
      ),
    );
    const outcome = await Effect.runPromise(
      safePost("https://author.example/stream", "{}", { purpose: "card" }),
    );
    expect(outcome.ok).toBe(false);
  });
});

describe("resolution", () => {
  it("refuses a hostname whose dns answer is private, even when the name looks public", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("dns-query")
          ? new Response(JSON.stringify({ Answer: [{ data: "10.0.0.7" }] }), { status: 200 })
          : new Response("page", { status: 200 }),
      ),
    );
    const outcome = await Effect.runPromise(
      safeFetch("https://evil.example/x", { purpose: "evidence" }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("resolves_private");
  });

  it("proceeds when every answer is public", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("dns-query")
          ? new Response(JSON.stringify({ Answer: [{ data: "93.184.216.34" }] }), { status: 200 })
          : new Response("page", { status: 200 }),
      ),
    );
    const outcome = await Effect.runPromise(
      safeFetch("https://public.example/x", { purpose: "evidence" }),
    );
    expect(outcome.ok).toBe(true);
  });
});
