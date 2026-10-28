import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../src/db/database.ts";
import { resolveRuntime } from "../src/agent/proxy.ts";

const ai = {
  run: vi.fn(async () => {
    throw new Error(
      "AiError: you have used up your daily free allocation of 10,000 neurons, please upgrade",
    );
  }),
};

const db: DatabaseImpl = {
  all: () => Effect.succeed([]),
  first: () => Effect.succeed(null),
  run: () => Effect.void,
  batch: () => Effect.void,
  changed: () => Effect.succeed(0),
} as unknown as DatabaseImpl;

describe("the neurons-exhausted fallback", () => {
  it("a spent workers-ai allocation serves the turn through nova on bedrock", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output: { message: { role: "assistant", content: [{ text: "hello from nova" }] } },
            usage: { inputTokens: 10, outputTokens: 5 },
          }),
          { status: 200 },
        ),
      ),
    );
    const runtime = resolveRuntime(
      {
        BEDROCK_ENABLED: "true",
        AWS_BEDROCK_API_KEY: "test-key",
        AWS_REGION: "us-east-1",
        AI: ai,
      } as never,
      db,
      "@cf/zai-org/glm-4.7-flash",
    );
    const result = await Effect.runPromise(
      runtime.complete([{ role: "user", content: "hi" }], false),
    );
    expect(result.text).toContain("hello from nova");
    vi.unstubAllGlobals();
  });

  it("a non-neuron model error still fails so real breakage is visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    const failingAi = {
      run: vi.fn(async () => {
        throw new Error("AiError: the model id does not exist");
      }),
    };
    const runtime = resolveRuntime(
      {
        BEDROCK_ENABLED: "true",
        AWS_BEDROCK_API_KEY: "test-key",
        AWS_REGION: "us-east-1",
        AI: failingAi,
      } as never,
      db,
      "@cf/zai-org/glm-4.7-flash",
    );
    const exit = await Effect.runPromiseExit(runtime.complete([{ role: "user", content: "hi" }], false));
    expect(exit._tag).toBe("Failure");
    vi.unstubAllGlobals();
  });
});
