import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import type { Manifest } from "../db/schema.ts";

export interface LivenessResult {
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly detail: string;
}

export const probeLiveness = (
  manifest: Manifest,
  listingId: string,
  version: number,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
  timeoutMs = 30_000,
): Effect.Effect<LivenessResult> =>
  Effect.gen(function* () {
    const runtime = manifest.runtime;
    if (runtime?.hosted === undefined) {
      return { ok: false, latencyMs: 0, detail: "not_hosted" };
    }
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const result = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetchImpl(
          new URL("/message:stream", runtime.hosted!.cardUrl).toString(),
          {
            method: "POST",
            headers: {
              "content-type": "application/a2a+json",
              accept: "text/event-stream",
            },
            body: JSON.stringify({
              klawva: { probe: true, listingId, listingVersion: version },
            }),
            signal: controller.signal,
          },
        );
        return { status: response.status };
      },
      catch: () => ({ status: 0 }),
    }).pipe(Effect.catch(() => Effect.succeed({ status: 0 })));
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    const ok = result.status > 0 && result.status < 500;
    return {
      ok,
      latencyMs,
      detail: ok ? `answered_${result.status}` : `no_answer_${result.status}`,
    };
  });

export const recordProbe = (
  db: DatabaseImpl,
  listingId: string,
  version: number,
  result: LivenessResult,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO canary_runs (id, listing_id, version, ok, latency_ms, detail, ran_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        listingId,
        version,
        result.ok ? 1 : 0,
        result.latencyMs,
        result.detail,
        new Date().toISOString(),
      ],
    )
    .pipe(Effect.orDie);
