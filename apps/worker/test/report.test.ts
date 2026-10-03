import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { fallbackReport, generateReport, parseReport } from "../src/report/report.ts";
import { ModelError } from "../src/agent/runtime.ts";

describe("report parsing", () => {
  it("parses a JSON report", () => {
    const report = parseReport(
      '{"summary":"done","stats":[{"label":"items","value":"4"}]}',
      [],
    );
    expect(report.summary).toBe("done");
    expect(report.stats).toEqual([{ label: "items", value: "4" }]);
  });

  it("falls back to the last assistant message on garbage", () => {
    const report = parseReport("not json", [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(report.summary).toBe("hello");
    expect(report.stats).toEqual([]);
  });

  it("falls back cleanly with no history", () => {
    expect(fallbackReport([]).summary).toBe("Shift complete.");
  });

  it("skips the model on an empty transcript", async () => {
    const runtime = {
      complete: () =>
        Effect.fail(new ModelError({ cause: "model should not be called" })),
    };
    const report = await Effect.runPromise(
      generateReport({ runtime, history: [] }),
    );
    expect(report.summary).toBe("Shift complete.");
    expect(report.stats).toEqual([]);
  });
});
