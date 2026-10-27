import { describe, expect, it, vi } from "vitest";
import { dohResponse } from "./doh.ts";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param } from "../src/db/database.ts";
import { ingestArtifact } from "../src/hosted/ingest.ts";
import type { Manifest } from "../src/db/schema.ts";

const dbWith = () => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const db: DatabaseImpl = {
    all: () => Effect.succeed([]),
    first: () => Effect.succeed(null),
    run: (sql, params) => {
      writes.push({ sql: String(sql), params: params ?? [] });
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  };
  return { db, writes };
};

const manifest = {
  soul: "x",
  runtime: { kind: "hosted", billing: "author-metered", transport: ["web"], hosted: { mode: "pull", cardUrl: "https://a.dev/card" } },
  report: { requireEvidence: true, minEvidence: 1 },
  limits: { maxWallClockSeconds: 86_400, maxEvents: 500, maxEventBytes: 4_096, maxArtifactBytes: 65_536, minIdleSeconds: 300 },
} as unknown as Manifest;

const base = { sessionId: "s1", taskId: "tsk_1", briefHash: "bh", manifest };
const okFetch = vi.fn(async (url: string) => url.includes("dns-query") ? dohResponse() : new Response("page", { status: 200 }));

describe("artifact ingest", () => {
  it("files a complete report with evidence and marks the task completed", async () => {
    const { db, writes } = dbWith();
    const outcome = await Effect.runPromise(
      ingestArtifact(
        db,
        {
          ...base,
          raw: JSON.stringify({
            outcome: "complete",
            summary: "found the price",
            stats: [{ label: "sources", value: "2" }],
            evidence: ["https://example.com/pricing"],
            limitations: [],
          }),
        },
        okFetch,
      ),
    );
    expect(outcome.ok).toBe(true);
    expect(writes.some((w) => w.sql.includes("INSERT INTO mission_reports"))).toBe(true);
    expect(writes.some((w) => w.sql.includes("INSERT INTO evidence_checks"))).toBe(true);
    expect(writes.some((w) => w.sql.includes("state = 'completed'"))).toBe(true);
  });

  it("fails the task when the artifact exceeds the cap", async () => {
    const { db } = dbWith();
    const outcome = await Effect.runPromise(
      ingestArtifact(db, { ...base, raw: JSON.stringify({ summary: "x".repeat(70_000) }) }),
    );
    expect(outcome).toEqual({ ok: false, reason: "artifact_too_large", failed: true });
  });

  it("refuses a report with no outcome", async () => {
    const { db } = dbWith();
    const outcome = await Effect.runPromise(
      ingestArtifact(db, { ...base, raw: JSON.stringify({ summary: "done" }) }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("missing_outcome");
  });

  it("fails when evidence does not resolve", async () => {
    const { db } = dbWith();
    const outcome = await Effect.runPromise(
      ingestArtifact(
        db,
        {
          ...base,
          raw: JSON.stringify({
            outcome: "complete",
            summary: "done",
            evidence: ["https://gone.example/x"],
          }),
        },
        async () => new Response("nope", { status: 404 }),
      ),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("evidence_unresolved");
  });

  it("treats an author-declared failed outcome as failed and refunds downstream", async () => {
    const { db } = dbWith();
    const outcome = await Effect.runPromise(
      ingestArtifact(db, { ...base, raw: JSON.stringify({ outcome: "failed", summary: "could not" }) }),
    );
    expect(outcome).toEqual({ ok: false, reason: "author_failed", failed: true });
  });
});

describe("ingest hardening", () => {
  it("is first-write-wins: a replayed artifact does not overwrite the filed report", async () => {
    const { db, writes } = dbWith();
    const first = await Effect.runPromise(
      ingestArtifact(
        db,
        { ...base, raw: JSON.stringify({ outcome: "complete", summary: "first", evidence: [] }) },
      ),
    );
    expect(first.ok).toBe(true);
    const replayDb = {
      ...db,
      first: (sql: string) =>
        String(sql).startsWith("SELECT id AS id FROM mission_reports")
          ? Effect.succeed({ id: "r1" })
          : Effect.succeed(null),
    } as unknown as DatabaseImpl;
    const second = await Effect.runPromise(
      ingestArtifact(
        replayDb,
        { ...base, raw: JSON.stringify({ outcome: "complete", summary: "second", evidence: [] }) },
      ),
    );
    expect(second).toEqual({ ok: true, reportId: "r1", evidenceChecked: 0 });
    void writes;
  });

  it("strips markup before the summary reaches a share page", async () => {
    const { db, writes } = dbWith();
    await Effect.runPromise(
      ingestArtifact(
        db,
        {
          ...base,
          raw: JSON.stringify({
            outcome: "complete",
            summary: "<img src=x onerror=alert(1)>done",
            evidence: [],
          }),
        },
      ),
    );
    const report = writes.find((w) => w.sql.includes("INSERT INTO mission_reports"));
    expect(String(report!.params[3])).not.toContain("<");
  });
});


describe("dispatch hands the artifact to ingest", () => {
  it("calls the injected ingest with the raw artifact and the task id", async () => {
    const { dispatchTask } = await import("../src/hosted/dispatch.ts");
    const { db } = dbWith();
    const seen: Array<{ taskId: string; raw: string }> = [];
    const artifactText = JSON.stringify({ outcome: "complete", summary: "done" });
    const sse =
      "event: artifact\n" +
      "data: " +
      JSON.stringify({ artifactUpdate: { artifact: { parts: [{ text: artifactText }] } } }) +
      "\n\n";
    const manifestForDispatch = {
      soul: "x",
      runtime: { kind: "hosted", billing: "author-metered", transport: ["web"], hosted: { mode: "push", cardUrl: "https://a.dev/card" } },
      report: { requireEvidence: true, minEvidence: 1 },
      limits: { maxWallClockSeconds: 86_400, maxEvents: 500, maxEventBytes: 4_096, maxArtifactBytes: 65_536, minIdleSeconds: 300 },
    } as unknown as Manifest;
    await Effect.runPromise(
      dispatchTask(
        db,
        {
          sessionId: "s-ingest",
          listingId: "l1",
          listingVersion: 1,
          manifest: manifestForDispatch,
          brief: { task: "x" },
          briefHash: "bh",
        },
        {
          fetchText: async (url: string) =>
            url.includes("dns-query") ? dohResponse() : url.endsWith("/card")
              ? new Response(JSON.stringify({ name: "a" }), { status: 200 })
              : new Response(sse, { status: 200 }),
          ingest: (input) => {
            seen.push({ taskId: input.taskId, raw: input.raw });
            return Effect.void;
          },
        },
      ),
    );
    expect(seen.length).toBe(1);
    expect(seen[0]!.raw).toContain("done");
  });
});
