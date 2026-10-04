import * as Effect from "effect/Effect";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  defaultToolAllowlist,
  resolveToolCall,
  runTurn,
  specsFor,
  type AgentRuntimeImpl,
} from "../src/agent/runtime.ts";
import { BlockedHost } from "../src/agent/tools.ts";
import { extractLinks, fetchLinks, fetchUrl, toText } from "../src/agent/tools.ts";

describe("tool allowlist", () => {
  it("exposes only allowed tools to the model", () => {
    const names = specsFor(["fetch_url"]).map(
      (spec) => (spec["function"] as { name: string }).name,
    );
    expect(names).toEqual(["fetch_url"]);
    expect(specsFor([])).toEqual([]);
    expect(specsFor(defaultToolAllowlist).length).toBe(2);
  });

  it("refuses tools outside the allowlist", async () => {
    const result = await Effect.runPromise(
      resolveToolCall(
        { id: "call_0", name: "fetch_url", arguments: "{}" },
        { sessionId: "s1" },
        [],
      ),
    );
    expect(result).toBe("tool fetch_url is not available");
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

describe("redirect guard", () => {
  let server: Server;
  let port = 0;
  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/start") {
        response.writeHead(302, { location: `http://127.0.0.1:${port}/secret` });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("secret");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        port = typeof address === "object" && address !== null ? address.port : 0;
        resolve();
      });
    });
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("blocks a redirect into a private host", async () => {
    const outcome = await Effect.runPromise(
      Effect.result(fetchUrl(`http://127.0.0.1:${port}/start`)),
    );
    expect(outcome._tag).toBe("Failure");
    if (outcome._tag === "Failure") {
      expect(outcome.failure._tag).toBe("BlockedHost");
      expect((outcome.failure as BlockedHost).host).toBe("127.0.0.1");
    }
  });

  it("rejects an invalid url without fetching", async () => {
    const outcome = await Effect.runPromise(Effect.result(fetchLinks("not a url")));
    expect(outcome._tag).toBe("Failure");
  });
});

describe("turn wiring", () => {
  const textRuntime: AgentRuntimeImpl = {
    complete: () => Effect.succeed({ text: "done", toolCalls: [] }),
  };

  it("returns plain text through the new params", async () => {
    const reply = await Effect.runPromise(
      runTurn({
        runtime: textRuntime,
        soul: "soul",
        brief: {},
        history: [{ role: "user", content: "hi" }],
        sessionId: "s1",
        allowlist: [],
      }),
    );
    expect(reply).toBe("done");
  });
});
