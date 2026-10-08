import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import {
  maxQueryChars,
  maxSearchChars,
  maxSearchResults,
  webSearch,
  type SearchFetcher,
} from "../src/agent/tools.ts";

const results = (count: number): Record<string, unknown> => ({
  web: {
    results: Array.from({ length: count }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      description: `Description ${i}`,
    })),
  },
});

const jsonFetcher = (body: unknown, status = 200): SearchFetcher => {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
};

describe("webSearch", () => {
  it("shapes brave results as titled lines with urls", async () => {
    const text = await Effect.runPromise(
      webSearch("iphone duo", "key", jsonFetcher(results(2))),
    );
    expect(text).toContain("Result 0 — https://example.com/0");
    expect(text).toContain("Description 1");
  });

  it("caps the result count and the total length", async () => {
    const text = await Effect.runPromise(
      webSearch("x", "key", jsonFetcher(results(maxSearchResults + 5))),
    );
    expect(text).not.toContain(`Result ${maxSearchResults}`);
    expect(text.length).toBeLessThanOrEqual(maxSearchChars);
  });

  it("says so when there are no results", async () => {
    const text = await Effect.runPromise(
      webSearch("x", "key", jsonFetcher(results(0))),
    );
    expect(text).toBe("no results found");
  });

  it("guides the model to fetch_url when no key is configured", async () => {
    let called = false;
    const text = await Effect.runPromise(
      webSearch("x", "", () => {
        called = true;
        return Promise.resolve(new Response("{}", { status: 200 }));
      }),
    );
    expect(called).toBe(false);
    expect(text).toContain("fetch_url");
  });

  it("rejects an empty or overlong query without calling the api", async () => {
    let called = false;
    const spy: SearchFetcher = () => {
      called = true;
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
    for (const query of ["", "  ", "x".repeat(maxQueryChars + 1)]) {
      const outcome = await Effect.runPromise(Effect.result(webSearch(query, "key", spy)));
      expect(outcome._tag).toBe("Failure");
    }
    expect(called).toBe(false);
  });

  it("fails on a non-ok response and on a body it cannot parse", async () => {
    const down = await Effect.runPromise(
      Effect.result(webSearch("x", "key", jsonFetcher({}, 429))),
    );
    expect(down._tag).toBe("Failure");
    if (down._tag === "Failure") {
      expect(down.failure._tag).toBe("SearchError");
    }
    const fetcher: SearchFetcher = () =>
      Promise.resolve(new Response("not json", { status: 200 }));
    const broken = await Effect.runPromise(
      Effect.result(webSearch("x", "key", fetcher)),
    );
    expect(broken._tag).toBe("Failure");
  });
});
