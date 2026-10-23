import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import {
  fallbackReport,
  fileCallReport,
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
    expect(writes[0].sql).toContain("ON CONFLICT(session_id, transport_id) WHERE transport_id IS NOT NULL");
    expect(writes[0].params[1]).toBe("s1");
    expect(writes[0].params[2]).toBe("t1");
  });
});
