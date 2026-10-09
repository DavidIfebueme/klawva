import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  defaultToolAllowlist,
  resolveAllowlist,
  resolveToolCall,
  runTurn,
  toolRegistry,
  specsFor,
  type AgentRuntimeImpl,
} from "../src/agent/runtime.ts";
import {
  extractLinks,
  fetchLinks,
  fetchUrl,
  isBlockedHost,
  maxRedirects,
  maxResponseBytes,
  toText,
  type Fetcher,
} from "../src/agent/tools.ts";

const SpecName = Schema.decodeUnknownSync(
  Schema.Struct({ function: Schema.Struct({ name: Schema.String }) }),
);

const specNames = (allowlist: ReadonlyArray<string>): ReadonlyArray<string> =>
  specsFor(allowlist).map((spec) => SpecName(spec).function.name);

describe("tool allowlist", () => {
  it("exposes only allowed tools to the model", () => {
    expect(specNames(["fetch_url"])).toEqual(["fetch_url"]);
    expect(specNames([])).toEqual([]);
    expect(specNames(defaultToolAllowlist).slice().sort()).toEqual(toolRegistry.map((tool) => tool.name).sort());
  });

  it("refuses tools outside the allowlist", async () => {
    const result = await Effect.runPromise(
      resolveToolCall(
        { id: "call_0", name: "fetch_url", arguments: "{}" },
        { sessionId: "s1", braveKey: "" },
        [],
      ),
    );
    expect(result).toBe("tool fetch_url is not available");
  });
});

describe("stored allowlist", () => {
  it("keeps the full default when a session predates the column", () => {
    expect(resolveAllowlist(null)).toEqual(defaultToolAllowlist);
  });

  it("honours an explicit empty listing", () => {
    expect(resolveAllowlist("[]")).toEqual([]);
  });

  it("drops names the registry does not define", () => {
    expect(resolveAllowlist('["fetch_url","rm_rf","extract_links"]')).toEqual([
      "fetch_url",
      "extract_links",
    ]);
  });

  it("falls back to the default on unreadable json", () => {
    expect(resolveAllowlist("not json")).toEqual(defaultToolAllowlist);
  });
});

const blockedHosts = [
  "localhost",
  "localhost.",
  "api.localhost",
  "metadata.internal.",
  "[::7f00:1]",
  "[::7f00:0001]",
  "metadata.internal",
  "printer.local",
  "127.0.0.1",
  "127.13.9.2",
  "0.0.0.0",
  "0.0.0.1",
  "10.4.5.6",
  "172.16.0.1",
  "172.31.255.254",
  "192.168.0.1",
  "169.254.169.254",
  "100.64.0.1",
  "100.127.255.255",
  "192.0.0.8",
  "198.18.0.1",
  "198.19.255.255",
  "224.0.0.1",
  "239.1.2.3",
  "240.0.0.1",
  "255.255.255.255",
  "[::1]",
  "[::]",
  "[0:0:0:0:0:0:0:1]",
  "[0000:0000:0000:0000:0000:0000:0000:0001]",
  "[::ffff:127.0.0.1]",
  "[::ffff:7f00:1]",
  "[::ffff:a9fe:a9fe]",
  "[64:ff9b::7f00:1]",
  "[fe80::1]",
  "[fe80:0:0:0:0:0:0:1]",
  "[fc00::1]",
  "[fd12:3456::1]",
  "[fdff::abcd]",
  "[ff02::1]",
];

const allowedHosts = [
  "boards.example",
  "www.klawva.xyz",
  "8.8.8.8",
  "172.15.255.255",
  "172.32.0.1",
  "100.63.255.255",
  "100.128.0.1",
  "192.0.1.1",
  "198.20.0.1",
  "223.255.255.255",
  "[2606:4700:4700::1111]",
  "[2001:db8::1]",
  "[fe00::1]",
];

describe("host guard", () => {
  it.each(blockedHosts)("blocks %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it.each(allowedHosts)("allows %s", (host) => {
    expect(isBlockedHost(host)).toBe(false);
  });
});

describe("body cap", () => {
  const streaming = (chunks: ReadonlyArray<string>): Response => {
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      }),
      { headers: { "content-type": "text/plain" } },
    );
  };

  it("returns no more than the cap when the body keeps coming", async () => {
    const chunk = "x".repeat(200_000);
    const sent = Math.ceil(maxResponseBytes / chunk.length) + 3;
    const fetcher: Fetcher = () =>
      Promise.resolve(streaming(Array.from({ length: sent }, () => chunk)));
    const text = await Effect.runPromise(
      fetchUrl("https://boards.example/big", fetcher),
    );
    expect(text.length).toBe(maxResponseBytes);
    expect(sent * chunk.length).toBeGreaterThan(maxResponseBytes);
  });

  it("returns a short body whole", async () => {
    const fetcher: Fetcher = () => Promise.resolve(streaming(["hello"]));
    const text = await Effect.runPromise(
      fetchUrl("https://boards.example/small", fetcher),
    );
    expect(text).toBe("hello");
  });

  it("returns empty for a bodyless response", async () => {
    const fetcher: Fetcher = () =>
      Promise.resolve(new Response(null, { status: 204 }));
    const text = await Effect.runPromise(
      fetchUrl("https://boards.example/empty", fetcher),
    );
    expect(text).toBe("");
  });
});

describe("redirect chain", () => {
  const recordingFetcher = (
    respond: (url: URL) => Response,
  ): { fetcher: Fetcher; asked: ReadonlyArray<string> } => {
    const asked: string[] = [];
    return {
      asked,
      fetcher: (url) => {
        asked.push(url.toString());
        return Promise.resolve(respond(url));
      },
    };
  };

  it("refuses a redirect into a private host and never fetches it", async () => {
    const { fetcher, asked } = recordingFetcher((url) =>
      url.hostname === "boards.example"
        ? new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data/" },
          })
        : new Response("INTERNAL-SECRET", { status: 200 }),
    );
    const outcome = await Effect.runPromise(
      Effect.result(fetchUrl("https://boards.example/start", fetcher)),
    );
    expect(outcome._tag).toBe("Failure");
    if (outcome._tag === "Failure") {
      expect(outcome.failure._tag).toBe("BlockedHost");
    }
    expect(asked).toEqual(["https://boards.example/start"]);
    expect(asked.join(" ")).not.toContain("169.254");
  });

  it("refuses a redirect into an ipv6 loopback literal", async () => {
    const { fetcher, asked } = recordingFetcher(
      () =>
        new Response(null, {
          status: 307,
          headers: { location: "http://[::1]:8080/admin" },
        }),
    );
    const outcome = await Effect.runPromise(
      Effect.result(fetchLinks("https://boards.example/x", fetcher)),
    );
    expect(outcome._tag).toBe("Failure");
    if (outcome._tag === "Failure") {
      expect(outcome.failure._tag).toBe("BlockedHost");
    }
    expect(asked.length).toBe(1);
  });

  it("follows a public redirect and returns the body", async () => {
    const { fetcher, asked } = recordingFetcher((url) =>
      url.hostname === "boards.example"
        ? new Response(null, {
            status: 301,
            headers: { location: "https://www.klawva.xyz/hiring" },
          })
        : new Response("<p>we are hiring</p>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
    );
    const text = await Effect.runPromise(
      fetchUrl("https://boards.example/jobs", fetcher),
    );
    expect(text).toBe("we are hiring");
    expect(asked).toEqual([
      "https://boards.example/jobs",
      "https://www.klawva.xyz/hiring",
    ]);
  });

  it("gives up after the hop budget", async () => {
    let hop = 0;
    const { fetcher } = recordingFetcher((url) => {
      hop += 1;
      return new Response(null, {
        status: 302,
        headers: { location: `https://boards.example/${hop}` },
      });
    });
    const outcome = await Effect.runPromise(
      Effect.result(fetchUrl("https://boards.example/start", fetcher)),
    );
    expect(outcome._tag).toBe("Failure");
    if (outcome._tag === "Failure") {
      expect(outcome.failure._tag).toBe("FetchError");
      if (outcome.failure._tag === "FetchError") {
        expect(outcome.failure.reason).toBe("too_many_redirects");
      }
    }
    expect(hop).toBe(maxRedirects + 1);
  });

  it("rejects an invalid url without fetching", async () => {
    const outcome = await Effect.runPromise(Effect.result(fetchLinks("not a url")));
    expect(outcome._tag).toBe("Failure");
  });
});

describe("link extraction", () => {
  it("keeps same-origin links and drops the rest", () => {
    const links = extractLinks(
      `<a href="/jobs/1">one</a><a href="https://other.example/x">off</a><a href="mailto:a@b.c">mail</a><a href="/jobs/1#top">dup</a>`,
      "https://boards.example/search",
    );
    expect(links).toEqual(["https://boards.example/jobs/1"]);
  });

  it("caps the result and rejects a bad base", () => {
    const html = Array.from(
      { length: 60 },
      (_, index) => `<a href="/p/${index}">x</a>`,
    ).join("");
    expect(extractLinks(html, "https://boards.example/").length).toBe(50);
    expect(extractLinks(`<a href="/x">x</a>`, "not a url")).toEqual([]);
  });
});

describe("text shaping", () => {
  it("strips scripts and tags", () => {
    expect(toText(`<script>alert(1)</script><p>Hello <b>there</b></p>`)).toBe(
      "Hello there",
    );
  });
});
