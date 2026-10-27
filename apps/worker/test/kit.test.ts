import { describe, expect, it } from "vitest";
import { dohResponse } from "./doh.ts";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param, Row } from "../src/db/database.ts";
import { kitRunIsFresh, runContractKit } from "../src/hosted/kit.ts";

const manifestJson = JSON.stringify({
  soul: "x",
  schema: 2,
  runtime: {
    kind: "hosted",
    billing: "author-metered",
    transport: ["web"],
    hosted: { mode: "push", cardUrl: "https://a.dev/card" },
  },
  report: { requireEvidence: true, minEvidence: 1 },
});

const fakeDb = (rows: ReadonlyArray<{ prefix: string; row: Row | null }> = []) => {
  const writes: Array<{ sql: string; params: ReadonlyArray<Param> }> = [];
  const find = (sql: string) => rows.find((entry) => sql.startsWith(entry.prefix));
  const db: DatabaseImpl = {
    all: () => Effect.succeed([]),
    first: (sql) => Effect.succeed(find(String(sql))?.row ?? null),
    run: (sql, params) => {
      writes.push({ sql: String(sql), params: params ?? [] });
      return Effect.void;
    },
    batch: () => Effect.void,
    changed: () => Effect.succeed(0),
  };
  return { db, writes };
};

const listingRows = [
  { prefix: "SELECT listing_id AS listingId FROM agent_tokens", row: { listingId: "l1" } },
  {
    prefix: "SELECT v.manifest AS manifest",
    row: { manifest: manifestJson, soul: "x", version: 1 },
  },
];

describe("contract kit", () => {
  it("passes when the card, the task and the artifact all answer", async () => {
    const { db, writes } = fakeDb(listingRows);
    const outcome = await Effect.runPromise(
      runContractKit(db, "al_ok", async (url: string) =>
        url.includes("dns-query") ? dohResponse() :
        new Response(
          'data: {"artifactUpdate":{"artifact":{"parts":[{"text":"{\\"outcome\\":\\"complete\\"}"}]}}}',
          { status: 200 },
        ),
      ),
    );
    expect(outcome.result?.ok).toBe(true);
    expect(outcome.result?.steps.map((step) => step.step)).toEqual([
      "card",
      "accept_task",
      "artifact_shape",
      "evidence_required",
      "cancel_accepted",
    ]);
    expect(writes.some((w) => w.sql.includes("INSERT INTO kit_runs"))).toBe(true);
  });

  it("fails when the endpoint refuses the task", async () => {
    const { db } = fakeDb(listingRows);
    const outcome = await Effect.runPromise(
      runContractKit(db, "al_ok", async (url) =>
        url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.endsWith("/card") ? new Response("{}", { status: 200 }) : new Response("", { status: 500 }),
      ),
    );
    expect(outcome.result?.ok).toBe(false);
  });

  it("refuses a listing that is not hosted", async () => {
    const { db } = fakeDb([
      { prefix: "SELECT listing_id AS listingId FROM agent_tokens", row: { listingId: "l1" } },
      { prefix: "SELECT v.manifest AS manifest", row: { manifest: JSON.stringify({ soul: "x" }), soul: "x", version: 1 } },
    ]);
    const outcome = await Effect.runPromise(runContractKit(db, "al_ok"));
    expect(outcome.status).toBe(409);
  });

  it("only counts a green run from the last day", async () => {
    const fresh = fakeDb([
      { prefix: "SELECT ok AS ok, ran_at AS ranAt FROM kit_runs", row: { ok: 1, ranAt: new Date().toISOString() } },
    ]);
    expect(await Effect.runPromise(kitRunIsFresh(fresh.db, "l1", 1, "ch"))).toBe(true);

    const stale = fakeDb([
      { prefix: "SELECT ok AS ok, ran_at AS ranAt FROM kit_runs", row: { ok: 1, ranAt: new Date(Date.now() - 2 * 86_400_000).toISOString() } },
    ]);
    expect(await Effect.runPromise(kitRunIsFresh(stale.db, "l1", 1, "ch"))).toBe(false);

    const red = fakeDb([
      { prefix: "SELECT ok AS ok, ran_at AS ranAt FROM kit_runs", row: { ok: 0, ranAt: new Date().toISOString() } },
    ]);
    expect(await Effect.runPromise(kitRunIsFresh(red.db, "l1", 1, "ch"))).toBe(false);
  });
});

describe("the green run is bound to what is submitted", () => {
  it("a different version or card url does not reuse an old green run", async () => {
    const db = {
      all: () => Effect.succeed([]),
      first: (sql: string, params?: ReadonlyArray<unknown>) =>
        String(sql).startsWith("SELECT ok AS ok") &&
        params?.[1] === 2 &&
        params?.[2] === "hash-a"
          ? Effect.succeed({ ok: 1, ranAt: new Date().toISOString() })
          : Effect.succeed(null),
      run: () => Effect.void,
      batch: () => Effect.void,
      changed: () => Effect.succeed(0),
    } as unknown as DatabaseImpl;
    expect(await Effect.runPromise(kitRunIsFresh(db, "l1", 2, "hash-a"))).toBe(true);
    expect(await Effect.runPromise(kitRunIsFresh(db, "l1", 3, "hash-a"))).toBe(false);
    expect(await Effect.runPromise(kitRunIsFresh(db, "l1", 2, "hash-b"))).toBe(false);
  });
});

describe("pull mode", () => {
  it("a pull listing is proven by its claim endpoint, not by an a2a stream", async () => {
    const pullManifest = JSON.stringify({
      soul: "x",
      schema: 2,
      runtime: {
        kind: "hosted",
        billing: "author-metered",
        transport: ["web"],
        hosted: { mode: "pull", cardUrl: "https://pull.example/agent" },
      },
      report: { requireEvidence: true, minEvidence: 1 },
    });
    const { db } = fakeDb([
      { prefix: "SELECT listing_id AS listingId FROM agent_tokens", row: { listingId: "l1" } },
      { prefix: "SELECT v.manifest AS manifest", row: { manifest: pullManifest, soul: "x", version: 1 } },
    ]);
    const outcome = await Effect.runPromise(
      runContractKit(db, "al_ok", async (url: string) => url.includes("dns-query") ? dohResponse() : new Response("{}", { status: 200 })),
    );
    expect(outcome.result?.steps.map((step) => step.step)).toEqual([
      "card",
      "pull_claim_reachable",
    ]);
    expect(outcome.result?.ok).toBe(true);
  });
});
