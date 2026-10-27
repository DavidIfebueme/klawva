import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import { manifestOf } from "../db/schema.ts";
import { listingForToken } from "./tokens.ts";
import { safeFetch, safePost } from "../lib/safe-fetch.ts";
import { hashToken } from "./tokens.ts";

export interface KitResult {
  readonly ok: boolean;
  readonly steps: ReadonlyArray<{ readonly step: string; readonly ok: boolean; readonly detail: string }>;
}

export const runContractKit = (
  db: DatabaseImpl,
  listingToken: string,
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>,
): Effect.Effect<{ status: number; result: KitResult | null; error?: string }> =>
  Effect.gen(function* () {
    const listingId = yield* listingForToken(db, listingToken);
    if (listingId === null) {
      return { status: 401, result: null, error: "bad_token" };
    }
    const version = yield* db
      .first(
        "SELECT v.manifest AS manifest, v.soul AS soul, l.current_version AS version FROM agent_listings l JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.id = ?",
        [listingId],
      )
      .pipe(Effect.orDie);
    if (version === null) {
      return { status: 404, result: null, error: "listing_not_found" };
    }
    const manifest = manifestOf({
      soul: String(version.soul ?? ""),
      manifest: version.manifest === null ? null : String(version.manifest),
    });
    const runtime = manifest.runtime;
    if (runtime?.hosted === undefined) {
      return { status: 409, result: null, error: "not_hosted" };
    }

    const steps: Array<{ step: string; ok: boolean; detail: string }> = [];

    const cardHash = yield* hashToken(runtime.hosted.cardUrl);
    const card = yield* safeFetch(runtime.hosted.cardUrl, { purpose: "card" }, fetchImpl);
    steps.push({
      step: "card",
      ok: card.ok && card.status >= 200 && card.status < 300,
      detail: card.ok ? `http_${card.status}` : card.reason,
    });

    if (runtime.hosted.mode === "pull") {
      const claim = yield* safePost(
        new URL("/api/agent/tasks/claim", runtime.hosted.cardUrl).toString(),
        "{}",
        { purpose: "card" },
        {},
        fetchImpl,
      );
      steps.push({
        step: "pull_claim_reachable",
        ok: claim.ok,
        detail: claim.ok ? `http_${claim.status}` : claim.reason,
      });
      const ok = steps.every((step) => step.ok);
      yield* db
        .run(
          "INSERT INTO kit_runs (id, listing_id, ok, detail, ran_at, version, card_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            crypto.randomUUID(),
            listingId,
            ok ? 1 : 0,
            JSON.stringify(steps),
            new Date().toISOString(),
            Number(version.version),
            cardHash,
          ],
        )
        .pipe(Effect.orDie);
      return { status: 200, result: { ok, steps } };
    }

    const streamUrl = new URL("/message:stream", runtime.hosted.cardUrl).toString();
    const response = yield* Effect.tryPromise({
      try: () =>
        (fetchImpl ?? ((url, init) => fetch(url, init)))(streamUrl, {
          method: "POST",
          headers: { "content-type": "application/a2a+json", accept: "text/event-stream" },
          body: JSON.stringify({ klawva: { kit: true, listingId } }),
        }),
      catch: () => null,
    }).pipe(Effect.catch(() => Effect.succeed(null)));
    const accepted = response !== null && response.status >= 200 && response.status < 300;
    steps.push({
      step: "accept_task",
      ok: accepted,
      detail: response === null ? "no_response" : `http_${response.status}`,
    });
    if (accepted) {
      const body = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => "",
      }).pipe(Effect.catch(() => Effect.succeed("")));
      const hasArtifact = body.includes("artifactUpdate") || body.includes("\"outcome\"");
      steps.push({
        step: "artifact_shape",
        ok: hasArtifact,
        detail: hasArtifact ? "artifact_present" : "no_artifact_in_reply",
      });
      steps.push({
        step: "evidence_required",
        ok: hasArtifact,
        detail: "hosted reports must carry at least one evidence url",
      });
      const cancel = yield* safePost(
        new URL("/message:stream", runtime.hosted.cardUrl).toString(),
        JSON.stringify({ klawva: { kit: true, cancel: true, listingId } }),
        { purpose: "card" },
        { "content-type": "application/a2a+json" },
        fetchImpl,
      );
      steps.push({
        step: "cancel_accepted",
        ok: cancel.ok,
        detail: cancel.ok ? `http_${cancel.status}` : cancel.reason,
      });
    }

    const ok = steps.every((step) => step.ok);
    yield* db
      .run(
        "INSERT INTO kit_runs (id, listing_id, ok, detail, ran_at, version, card_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          crypto.randomUUID(),
          listingId,
          ok ? 1 : 0,
          JSON.stringify(steps),
          new Date().toISOString(),
          Number(version.version),
          cardHash,
        ],
      )
      .pipe(Effect.orDie);

    return { status: 200, result: { ok, steps } };
  });

export const kitRunIsFresh = (
  db: DatabaseImpl,
  listingId: string,
  version: number,
  cardHash: string,
  now: Date = new Date(),
): Effect.Effect<boolean> =>
  db
    .first(
      "SELECT ok AS ok, ran_at AS ranAt FROM kit_runs WHERE listing_id = ? AND version = ? AND card_hash = ? ORDER BY ran_at DESC LIMIT 1",
      [listingId, version, cardHash],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => {
        if (row === null || Number(row.ok) !== 1) {
          return false;
        }
        return now.getTime() - Date.parse(String(row.ranAt)) <= 24 * 60 * 60 * 1_000;
      }),
    );
