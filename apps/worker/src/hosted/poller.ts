import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import type { Manifest } from "../db/schema.ts";
import { manifestOf } from "../db/schema.ts";
import { safeFetch, safePost } from "../lib/safe-fetch.ts";
import { removeFromSearch } from "../search/indexing.ts";
import { appendEvent, shouldDisableListing } from "./events.ts";

const PolledTaskRow = Schema.Struct({
  taskId: Schema.String,
  listingId: Schema.String,
  listingVersion: Schema.Number,
  dispatchedAt: Schema.NullOr(Schema.String),
  lastEventAt: Schema.NullOr(Schema.String),
  lastPollState: Schema.NullOr(Schema.String),
  cancelDeliveredAt: Schema.NullOr(Schema.String),
  briefHash: Schema.NullOr(Schema.String),
  manifest: Schema.NullOr(Schema.String),
});

export type PollOutcome =
  | { readonly ok: true; readonly taskId: string; readonly state: string }
  | { readonly ok: false; readonly reason: string };

const TERMINAL: ReadonlyMap<string, string> = new Map([
  ["TASK_STATE_COMPLETED", "completed"],
  ["TASK_STATE_FAILED", "failed"],
  ["TASK_STATE_CANCELED", "cancelled"],
  ["TASK_STATE_CANCELLED", "cancelled"],
]);

export const pollWorkingTasks = (
  db: DatabaseImpl,
  env: { DESKTOP_BUNDLES_ENABLED?: string },
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
): Effect.Effect<ReadonlyArray<PollOutcome>> =>
  Effect.gen(function* () {
    const tasks = yield* db
      .all(
        "SELECT t.id AS taskId, t.listing_id AS listingId, t.listing_version AS listingVersion, t.dispatched_at AS dispatchedAt, t.last_event_at AS lastEventAt, t.last_poll_state AS lastPollState, t.cancel_delivered_at AS cancelDeliveredAt, t.brief_hash AS briefHash, v.manifest AS manifest FROM session_tasks t JOIN sessions s ON s.id = t.session_id JOIN listing_versions v ON v.listing_id = t.listing_id AND v.version = t.listing_version WHERE t.state = 'working' LIMIT 50",
      )
      .pipe(Effect.orDie);
    const outcomes: Array<PollOutcome> = [];
    for (const row of tasks) {
      const decoded = Schema.decodeUnknownOption(PolledTaskRow)(row);
      if (decoded._tag === "None") {
        continue;
      }
      const outcome = yield* pollTask(db, decoded.value, fetchImpl).pipe(
        Effect.catch(() => Effect.succeed({ ok: false as const, reason: "poll_error" })),
      );
      outcomes.push(outcome);
    }
    return outcomes;
  });

interface PolledTask {
  readonly taskId: string;
  readonly listingId: string;
  readonly listingVersion: number;
  readonly dispatchedAt: string | null;
  readonly lastEventAt: string | null;
  readonly lastPollState: string | null;
  readonly cancelDeliveredAt: string | null;
  readonly briefHash: string | null;
  readonly manifest: string | null;
}

const pollTask = (
  db: DatabaseImpl,
  task: PolledTask,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
): Effect.Effect<PollOutcome> =>
  Effect.gen(function* () {
    const now = new Date();
    const nowIso = now.toISOString();
    const manifest: Manifest = manifestOf({
      soul: "",
      manifest: typeof task.manifest === "string" ? task.manifest : null,
    });
    const limits = manifest.limits;
    const wallClockSeconds = limits?.maxWallClockSeconds ?? 86_400;
    if (
      task.dispatchedAt !== null &&
      now.getTime() - Date.parse(task.dispatchedAt) > wallClockSeconds * 1_000
    ) {
      yield* db
        .run(
          "UPDATE session_tasks SET state = 'expired', failure_reason = 'wall_clock', updated_at = ? WHERE id = ? AND state = 'working'",
          [nowIso, task.taskId],
        )
        .pipe(Effect.orDie);
      return { ok: true, taskId: task.taskId, state: "expired" };
    }
    if (
      task.lastEventAt !== null &&
      now.getTime() - Date.parse(task.lastEventAt) > 1_800_000
    ) {
      yield* db
        .run(
          "UPDATE session_tasks SET state = 'failed', failure_reason = 'idle', updated_at = ? WHERE id = ? AND state = 'working'",
          [nowIso, task.taskId],
        )
        .pipe(Effect.orDie);
      return { ok: true, taskId: task.taskId, state: "failed" };
    }

    const hosted = manifest.runtime?.kind === "hosted" ? manifest.runtime.hosted : undefined;
    if (hosted === undefined) {
      return { ok: false, reason: "not_hosted" };
    }
    const cardBase = new URL(hosted.cardUrl);
    let deliveredNow = false;
    const cancel = task.cancelDeliveredAt === null
      ? yield* db
        .first(
          "SELECT cancel_requested_at AS requestedAt FROM session_tasks WHERE id = ?",
          [task.taskId],
        )
        .pipe(Effect.orDie)
      : null;
    if (cancel !== null && cancel.requestedAt !== null) {
      const cancelUrl = new URL(`/tasks/${task.taskId}:cancel`, cardBase).toString();
      yield* safePost(cancelUrl, "{}", { purpose: "card" }, { "content-type": "application/a2a+json" }, fetchImpl);
      yield* db
        .run(
          "UPDATE session_tasks SET cancel_delivered_at = ?, updated_at = ? WHERE id = ?",
          [nowIso, nowIso, task.taskId],
        )
        .pipe(Effect.orDie);
      deliveredNow = true;
    }

    const taskUrl = new URL(`/tasks/${task.taskId}`, cardBase).toString();
    const fetched = yield* safeFetch(taskUrl, { purpose: "card" }, fetchImpl);
    if (!fetched.ok) {
      return { ok: false, reason: `poll_${fetched.reason}` };
    }
    let frame: unknown;
    try {
      frame = JSON.parse(fetched.body);
    } catch {
      frame = null;
    }
    if (frame === null || typeof frame !== "object") {
      return { ok: false, reason: "poll_shape" };
    }
    const record = frame as {
      status?: { state?: unknown };
      artifacts?: ReadonlyArray<{ parts?: ReadonlyArray<{ text?: unknown }> }>;
    };
    const rawState = typeof record.status?.state === "string" ? record.status.state : "TASK_STATE_WORKING";
    const normalized = TERMINAL.get(rawState) ?? "working";
    if ((task.cancelDeliveredAt !== null || deliveredNow) && normalized === "working") {
      yield* db
        .run(
          "UPDATE session_tasks SET ignored_cancels = ignored_cancels + 1, updated_at = ? WHERE id = ?",
          [nowIso, task.taskId],
        )
        .pipe(Effect.orDie);
      const row = yield* db
        .first(
          "SELECT ignored_cancels AS ignored, listing_id AS listingId FROM session_tasks WHERE id = ?",
          [task.taskId],
        )
        .pipe(Effect.orDie);
      if (row !== null && shouldDisableListing(Number(row.ignored))) {
        yield* db
          .run(
            "UPDATE agent_listings SET status = 'unpublished', updated_at = ? WHERE id = ?",
            [nowIso, String(row.listingId)],
          )
          .pipe(Effect.orDie);
        yield* removeFromSearch(db, String(row.listingId));
        yield* db
          .run(
            "UPDATE session_tasks SET state = 'cancelled', updated_at = ? WHERE id = ? AND state = 'working'",
            [nowIso, task.taskId],
          )
          .pipe(Effect.orDie);
        return { ok: true, taskId: task.taskId, state: "cancelled" };
      }
    }
    if (normalized !== "working" && normalized !== task.lastPollState) {
      yield* appendEvent(db, {
        taskId: task.taskId,
        kind: "status",
        payload: JSON.stringify({ state: normalized }),
      }).pipe(Effect.catch(() => Effect.void));
    }
    if (normalized === "working") {
      yield* db
        .run(
          "UPDATE session_tasks SET last_poll_state = ?, updated_at = ? WHERE id = ?",
          [normalized, nowIso, task.taskId],
        )
        .pipe(Effect.orDie);
      return { ok: true, taskId: task.taskId, state: "working" };
    }
    const artifact = record.artifacts?.at(-1)?.parts?.find((part) => typeof part.text === "string");
    if (normalized === "completed" && artifact?.text === undefined) {
      yield* db
        .run(
          "UPDATE session_tasks SET state = 'failed', failure_reason = 'completed_without_artifact', updated_at = ? WHERE id = ? AND state = 'working'",
          [nowIso, task.taskId],
        )
        .pipe(Effect.orDie);
      return { ok: true, taskId: task.taskId, state: "failed" };
    }
    const state = normalized === "completed" ? "reported" : "failed";
    yield* db
      .run(
        "UPDATE session_tasks SET state = ?, last_poll_state = ?, updated_at = ? WHERE id = ? AND state = 'working'",
        [state, normalized, nowIso, task.taskId],
      )
      .pipe(Effect.orDie);
    return { ok: true, taskId: task.taskId, state };
  });
