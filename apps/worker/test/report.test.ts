import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import {
  fallbackReport,
  fileCallReport,
  validateReport,
  generateReport,
  parseReport,
  zeroTurnReport,
} from "../src/report/report.ts";
import { ModelError } from "../src/agent/runtime.ts";
import type { DatabaseImpl, Param } from "../src/db/database.ts";

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

describe("report layers", () => {
  it("says nothing happened, in plain words, with no stats", () => {
    expect(zeroTurnReport.summary).toContain("Nothing happened");
    expect(zeroTurnReport.stats).toEqual([]);
  });

  it("files a call report keyed by session plus transport", async () => {
    const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([]),
      first: () => Effect.succeed(null),
      run: (sql, params) => {
        writes.push({ sql, params: params ?? [] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    await Effect.runPromise(
      fileCallReport(db, "s1", "t1", { summary: "call done", stats: [] }),
    );
    expect(writes.length).toBe(1);
    expect(writes[0].sql.toUpperCase()).toContain("CONFLICT");
    expect(writes[0].params[1]).toBe("s1");
    expect(writes[0].params[2]).toBe("t1");
  });

  it("overwrites the first report when the same session plus transport reports twice, and a digest coexists with a call report", async () => {
    const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
    const db: DatabaseImpl = {
      all: () => Effect.succeed([]),
      first: () => Effect.succeed(null),
      run: (sql, params) => {
        writes.push({ sql, params: params ?? [] });
        return Effect.void;
      },
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    };
    await Effect.runPromise(
      fileCallReport(db, "s1", "t1", { summary: "first", stats: [] }),
    );
    await Effect.runPromise(
      fileCallReport(db, "s1", "t1", { summary: "second wins", stats: [] }),
    );
    const callReports = writes.filter(
      (w) => !w.sql.includes("digest") && w.params[2] === "t1",
    );
    expect(callReports.length).toBe(2);
    for (const write of callReports) {
      expect(write.sql.toUpperCase()).toContain("CONFLICT");
      expect(write.sql.toUpperCase()).toContain("UPDATE");
    }
    expect(callReports[0].params[3]).toContain("first");
    expect(callReports[1].params[3]).toContain("second wins");

    await Effect.runPromise(
      fileCallReport(db, "s1", "", { summary: "shift digest", stats: [] }),
    );
    const digest = writes[2];
    expect(digest.sql.toUpperCase()).toContain("CONFLICT");
    expect(digest.params[3]).toContain("shift digest");
  });
});

describe("report validation", () => {
  const base = { summary: "done", stats: [] };
  it("rejects an empty summary", () => {
    expect(validateReport({ summary: "  ", stats: [] }, {}).ok).toBe(false);
  });

  it("requires an outcome once the report is task-bound", () => {
    const verdict = validateReport(base, { taskId: "tsk_1" });
    expect(verdict).toEqual({ ok: false, reason: "missing_outcome" });
  });

  it("accepts a complete task-bound report with evidence", () => {
    const verdict = validateReport(
      { outcome: "complete", summary: "done", stats: [], evidence: ["https://x.dev/a"] },
      { taskId: "tsk_1", briefHash: "b", artifactHash: "a" },
    );
    expect(verdict.ok).toBe(true);
  });

  it("refuses non-url evidence", () => {
    const verdict = validateReport(
      { outcome: "partial", summary: "done", stats: [], evidence: ["not a url"] },
      { taskId: "tsk_1" },
    );
    expect(verdict).toEqual({ ok: false, reason: "evidence_not_url" });
  });
});
