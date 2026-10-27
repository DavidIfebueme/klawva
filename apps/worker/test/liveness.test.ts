import { describe, expect, it, vi } from "vitest";
import { dohResponse } from "./doh.ts";
import * as Effect from "effect/Effect";
import type { DatabaseImpl, Param } from "../src/db/database.ts";
import { probeLiveness } from "../src/hosted/liveness.ts";
import type { Manifest } from "../src/db/schema.ts";

const manifest = {
  soul: "x",
  runtime: { kind: "hosted", billing: "author-metered", transport: ["web"], hosted: { mode: "push", cardUrl: "https://a.dev/card" } },
} as unknown as Manifest;

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

describe("liveness probe", () => {
  it("counts an answered call as alive", async () => {
    const result = await Effect.runPromise(
      probeLiveness(manifest, "l1", 1, async () => new Response("", { status: 200 })),
    );
    expect(result.ok).toBe(true);
  });

  it("counts a 5xx as dead", async () => {
    const result = await Effect.runPromise(
      probeLiveness(manifest, "l1", 1, async () => new Response("", { status: 502 })),
    );
    expect(result.ok).toBe(false);
  });

  it("counts a network failure as dead instead of throwing", async () => {
    const result = await Effect.runPromise(
      probeLiveness(manifest, "l1", 1, async () => {
        throw new Error("boom");
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("no_answer");
  });

  it("refuses a listing that is not hosted", async () => {
    const result = await Effect.runPromise(
      probeLiveness({ soul: "x" } as unknown as Manifest, "l1", 1, async () => new Response("")),
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("not_hosted");
  });

  it("records every probe in canary_runs", async () => {
    const { db, writes } = dbWith();
    const { recordProbe } = await import("../src/hosted/liveness.ts");
    await Effect.runPromise(recordProbe(db, "l1", 1, { ok: true, latencyMs: 12, detail: "answered_200" }));
    expect(writes[0].sql).toContain("INSERT INTO canary_runs");
    expect(writes[0].params[3]).toBe(1);
  });

  it("a dead endpoint fails dispatch before the brief is sent", async () => {
    const { dispatchTask } = await import("../src/hosted/dispatch.ts");
    const { db, writes } = dbWith();
    const calls: string[] = [];
    const deps = {
      fetchText: async (url: string) => {
        calls.push(url);
        return url.includes("dns-query") ? dohResponse() : url.includes("dns-query") ? dohResponse() : url.endsWith("/card")
          ? new Response(JSON.stringify({ name: "a" }), { status: 200 })
          : new Response("", { status: 503 });
      },
    };
    const exit = await Effect.runPromiseExit(
      dispatchTask(
        db,
        {
          sessionId: "s-probe",
          listingId: "l1",
          listingVersion: 1,
          manifest,
          brief: { task: "x" },
          briefHash: "h",
        },
        deps,
      ),
    );
    expect(exit._tag).toBe("Failure");
    expect(calls.some((url) => url.includes("message:stream"))).toBe(true);
    expect(calls.filter((url) => url.includes("message:stream")).length).toBe(1);
    void vi;
  });
});
