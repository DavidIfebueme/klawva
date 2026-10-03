import { describe, expect, it } from "vitest";
import { fallbackReport, parseReport } from "../src/report/report.ts";

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
});
