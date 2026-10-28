import { describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../src/db/database.ts";
import { resolveRuntime } from "../src/agent/proxy.ts";

const countersDb = (): DatabaseImpl => {
  const rows = new Map<string, number>();
  return {
    all: () => Effect.succeed([]),
    first: (_sql, params) => {
      const key = params?.[0];
      if (typeof key !== "string") {
        return Effect.succeed(null);
      }
      const value = rows.get(key);
      return Effect.succeed(value === undefined ? null : { value });
    },
    run: (_sql, params) => {
      const key = params?.[0];
      const value = params?.[1];
      if (typeof key === "string" && typeof value === "number") {
        rows.set(key, value);
      }
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(1),
  };
};

const spentAi = () => ({
  run: vi.fn(async () => {
    throw new Error(
      "AiError: you have used up your daily free allocation of 10,000 neurons, please upgrade",
    );
  }),
});

const novaResponse = () =>
  vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          output: { message: { role: "assistant", content: [{ text: "hello from nova" }] } },
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
        { status: 200 },
      ),
  );

describe("the neurons-exhausted fallback", () => {
  it("a spent workers-ai allocation serves the turn through nova on bedrock", async () => {
    vi.stubGlobal("fetch", novaResponse());
    const ai = spentAi();
    const runtime = resolveRuntime(
      {
        BEDROCK_ENABLED: "true",
        AWS_BEDROCK_API_KEY: "test-key",
        AWS_REGION: "us-east-1",
        AI: ai,
      } as never,
      countersDb(),
      "@cf/zai-org/glm-4.7-flash",
    );
    const result = await Effect.runPromise(
      runtime.complete([{ role: "user", content: "hi" }], false),
    );
    expect(result.text).toContain("hello from nova");
    vi.unstubAllGlobals();
  });

  it("a known spent quota stops probing workers ai and stays on nova", async () => {
    vi.stubGlobal("fetch", novaResponse());
    const ai = spentAi();
    const runtime = resolveRuntime(
      {
        BEDROCK_ENABLED: "true",
        AWS_BEDROCK_API_KEY: "test-key",
        AWS_REGION: "us-east-1",
        AI: ai,
      } as never,
      countersDb(),
      "@cf/zai-org/glm-4.7-flash",
    );
    await Effect.runPromise(runtime.complete([{ role: "user", content: "hi" }], false));
    const second = await Effect.runPromise(
      runtime.complete([{ role: "user", content: "hi again" }], false),
    );
    expect(second.text).toContain("hello from nova");
    expect(ai.run).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("a known spent quota with no bedrock fails without another workers ai call", async () => {
    vi.stubGlobal("fetch", novaResponse());
    const ai = spentAi();
    const runtime = resolveRuntime(
      { AI: ai } as never,
      countersDb(),
      "@cf/zai-org/glm-4.7-flash",
    );
    const first = await Effect.runPromiseExit(
      runtime.complete([{ role: "user", content: "hi" }], false),
    );
    const second = await Effect.runPromiseExit(
      runtime.complete([{ role: "user", content: "hi again" }], false),
    );
    expect(first._tag).toBe("Failure");
    expect(second._tag).toBe("Failure");
    expect(ai.run).toHaveBeenCalledTimes(1);
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
      countersDb(),
      "@cf/zai-org/glm-4.7-flash",
    );
    const exit = await Effect.runPromiseExit(
      runtime.complete([{ role: "user", content: "hi" }], false),
    );
    expect(exit._tag).toBe("Failure");
    expect(failingAi.run).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
