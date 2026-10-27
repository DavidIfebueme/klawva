import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import type { Manifest } from "../db/schema.ts";

export type TaskHealth = "healthy" | "degraded" | "paused";

export const healthThresholds = {
  degradedSeconds: 300,
  pausedSeconds: 1_800,
} as const;

export const taskHealth = (params: {
  readonly lastEventAt: string | null;
  readonly now: Date;
  readonly limits?: Manifest["limits"];
}): TaskHealth => {
  if (params.lastEventAt === null) {
    return "healthy";
  }
  const idleMs = params.now.getTime() - Date.parse(params.lastEventAt);
  if (Number.isNaN(idleMs)) {
    return "healthy";
  }
  const idleSeconds = Math.floor(idleMs / 1_000);
  const paused = Math.max(
    params.limits?.minIdleSeconds ?? healthThresholds.pausedSeconds,
    healthThresholds.pausedSeconds,
  );
  const degraded = Math.min(
    healthThresholds.degradedSeconds,
    Math.floor(paused / 2),
  );
  if (idleSeconds >= paused) {
    return "paused";
  }
  if (idleSeconds >= degraded) {
    return "degraded";
  }
  return "healthy";
};

export const appendEvent = (
  db: DatabaseImpl,
  params: {
    readonly taskId: string;
    readonly kind: string;
    readonly payload: string;
    readonly maxEventBytes?: number;
    readonly maxEvents?: number;
  },
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const cap = params.maxEventBytes ?? 4_096;
    const payload =
      params.payload.length > cap ? params.payload.slice(0, cap) : params.payload;
    const now = new Date().toISOString();
    const maxEvents = params.maxEvents ?? 500;
    // one statement computes the sequence from the log itself, so two workers
    // cannot both read the same count and write the same seq
    yield* db
      .run(
        "INSERT INTO task_events (id, task_id, seq, kind, payload, received_at) SELECT ?, ?, COALESCE(MAX(seq) + 1, 0), ?, ?, ? FROM task_events WHERE task_id = ? ON CONFLICT(task_id, seq) DO NOTHING",
        [crypto.randomUUID(), params.taskId, params.kind, payload, now, params.taskId],
      )
      .pipe(Effect.orDie);
    const counted = yield* db
      .first(
        "SELECT COUNT(*) AS count FROM task_events WHERE task_id = ?",
        [params.taskId],
      )
      .pipe(Effect.orDie);
    const count = counted === null ? 0 : Number(counted.count);
    if (count > maxEvents) {
      yield* db
        .run(
          "UPDATE session_tasks SET state = 'failed', failure_reason = 'event_cap', updated_at = ? WHERE id = ?",
          [now, params.taskId],
        )
        .pipe(Effect.orDie);
      return "event_cap";
    }
    yield* db
      .run(
        "UPDATE session_tasks SET event_count = ?, last_event_at = ?, bytes_in = bytes_in + ?, updated_at = ? WHERE id = ?",
        [count, now, payload.length, now, params.taskId],
      )
      .pipe(Effect.orDie);
    return "recorded";
  });

export const requestCancel = (
  db: DatabaseImpl,
  taskId: string,
): Effect.Effect<void> =>
  db
    .run(
      "UPDATE session_tasks SET cancel_requested_at = ?, updated_at = ? WHERE id = ? AND cancel_requested_at IS NULL",
      [new Date().toISOString(), new Date().toISOString(), taskId],
    )
    .pipe(Effect.orDie);

export const acknowledgeCancel = (
  db: DatabaseImpl,
  taskId: string,
): Effect.Effect<void> =>
  db
    .run(
      "UPDATE session_tasks SET cancel_acked_at = ?, state = 'cancelled', updated_at = ? WHERE id = ?",
      [new Date().toISOString(), new Date().toISOString(), taskId],
    )
    .pipe(Effect.orDie);

export const ignoredCancelsSince = (
  db: DatabaseImpl,
  listingId: string,
  sinceIso: string,
): Effect.Effect<number> =>
  db
    .first(
      "SELECT COUNT(*) AS count FROM session_tasks WHERE listing_id = ? AND cancel_requested_at IS NOT NULL AND cancel_acked_at IS NULL AND cancel_requested_at >= ?",
      [listingId, sinceIso],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row === null ? 0 : Number(row.count))),
    );

export const shouldDisableListing = (ignoredCancels: number): boolean =>
  ignoredCancels >= 2;

export const cancelWindowStart = (now: Date): string =>
  new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000).toISOString();

export const sessionTaskState = (
  db: DatabaseImpl,
  sessionId: string,
  limits?: Manifest["limits"],
  now: Date = new Date(),
): Effect.Effect<{
  readonly state: string | null;
  readonly health: TaskHealth;
  readonly lastEventAt: string | null;
}> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT state AS state, last_event_at AS lastEventAt FROM session_tasks WHERE session_id = ?",
        [sessionId],
      )
      .pipe(Effect.orDie);
    if (row === null) {
      return { state: null, health: "healthy" as const, lastEventAt: null };
    }
    const lastEventAt = row.lastEventAt === null ? null : String(row.lastEventAt);
    return {
      state: String(row.state),
      health: taskHealth({ lastEventAt, now, limits }),
      lastEventAt,
    };
  });
