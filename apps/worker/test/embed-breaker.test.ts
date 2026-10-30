import { afterEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import { embedText, semanticAllowed, type EmbedConfig } from "../src/search/embed.ts";

const config: EmbedConfig = {
  model: "amazon.titan-embed-text-v2:0",
  region: "us-east-1",
  dimensions: 4,
  apiKey: "ABSK_test",
  accessKeyId: undefined,
  secretAccessKey: undefined,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the embedding breaker", () => {
  it("reopens after the cooldown even while rejected calls keep arriving", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await Effect.runPromiseExit(embedText(config, "chase invoices"));
    }
    expect(semanticAllowed()).toBe(false);

    vi.setSystemTime(30_000);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await Effect.runPromiseExit(embedText(config, "chase invoices"));
    }

    vi.setSystemTime(61_000);
    expect(semanticAllowed()).toBe(true);
  });
});
