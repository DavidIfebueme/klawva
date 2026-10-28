import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import type { AgentRuntimeImpl } from "../src/agent/runtime.ts";
import { runEval } from "../src/eval/eval.ts";

const fixedRuntime = (inTokens: number, outTokens: number): AgentRuntimeImpl => ({
  complete: () =>
    Effect.succeed({
      text: "I summarise documents and answer questions.",
      toolCalls: [],
      usage: { inTokens, outTokens },
    }),
});

describe("runEval usage", () => {
  it("reports the tokens of every case it ran so the studio can bill them", async () => {
    const result = await Effect.runPromise(
      runEval({
        runtime: fixedRuntime(10, 5),
        soul: "You are a researcher.",
        brief: { task: "summarise" },
        cases: ["Summarize your role in one sentence.", "List what you can do."],
      }),
    );
    expect(result.usage).toEqual({ inTokens: 20, outTokens: 10 });
    expect(result.results).toHaveLength(2);
  });
});
