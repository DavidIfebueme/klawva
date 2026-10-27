import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import type { Manifest } from "../db/schema.ts";
import { safeFetch, safePost } from "../lib/safe-fetch.ts";

export class DispatchError extends Schema.TaggedError<DispatchError>()(
  "DispatchError",
  { reason: Schema.String },
) {}

export const hostedEnabled = (value: string | undefined): boolean =>
  value === "true";

export interface TaskBrief {
  readonly [key: string]: string;
}

export interface DispatchInput {
  readonly sessionId: string;
  readonly listingId: string;
  readonly listingVersion: number;
  readonly manifest: Manifest;
  readonly brief: TaskBrief;
  readonly briefHash: string;
}

export interface DispatchedTask {
  readonly taskId: string;
  readonly state: string;
  readonly replay: boolean;
}

export const deterministicTaskId = async (
  sessionId: string,
  listingVersion: number,
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${sessionId}:${listingVersion}`),
  );
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < 26; i++) {
    out += alphabet[bytes[i]! % 32];
  }
  return `tsk_${out}`;
};

const effectiveLimits = (manifest: Manifest) => ({
  maxWallClockSeconds: manifest.limits?.maxWallClockSeconds ?? 86_400,
  maxEvents: manifest.limits?.maxEvents ?? 500,
  maxEventBytes: manifest.limits?.maxEventBytes ?? 4_096,
  maxArtifactBytes: manifest.limits?.maxArtifactBytes ?? 65_536,
});

export interface SseFrame {
  readonly event: string;
  readonly data: string;
}

export const parseSse = (raw: string): ReadonlyArray<SseFrame> => {
  const frames: SseFrame[] = [];
  let event = "message";
  let data: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trim());
    } else if (line.trim() === "") {
      if (data.length > 0) {
        frames.push({ event, data: data.join("\n") });
      }
      event = "message";
      data = [];
    }
  }
  if (data.length > 0) {
    frames.push({ event, data: data.join("\n") });
  }
  return frames;
};

const isA2aTaskFrame = (
  value: unknown,
): value is { task?: { id?: string; status?: { state?: string } } } =>
  typeof value === "object" && value !== null;

export interface DispatchIngest {
  readonly ingest: (input: {
    readonly sessionId: string;
    readonly taskId: string;
    readonly briefHash: string;
    readonly manifest: Manifest;
    readonly raw: string;
  }) => Effect.Effect<unknown>;
}

export interface DispatchDeps {
  readonly fetchText: (url: string, init: RequestInit) => Promise<Response>;
  readonly ingest?: DispatchIngest["ingest"];
}

const defaultDeps: DispatchDeps = {
  fetchText: (url, init) => fetch(url, init),
};

export const dispatchTask = (
  db: DatabaseImpl,
  input: DispatchInput,
  deps: DispatchDeps = defaultDeps,
): Effect.Effect<DispatchedTask, DispatchError> =>
  Effect.gen(function* () {
    const runtime = input.manifest.runtime;
    if (runtime === undefined || runtime.kind !== "hosted" || runtime.hosted === undefined) {
      return yield* Effect.fail(new DispatchError({ reason: "not_hosted" }));
    }
    const hosted = runtime.hosted;
    const taskId = yield* Effect.promise(() =>
      deterministicTaskId(input.sessionId, input.listingVersion),
    );

    const existing = yield* db
      .first("SELECT id AS id, state AS state FROM session_tasks WHERE session_id = ?", [
        input.sessionId,
      ])
      .pipe(Effect.orDie);
    if (existing !== null) {
      return { taskId: String(existing.id), state: String(existing.state), replay: true };
    }

    const now = new Date().toISOString();
    yield* db
      .run(
        "INSERT INTO session_tasks (id, session_id, listing_id, listing_version, carrier, state, dispatched_at, brief_hash, created_at, updated_at) VALUES (?, ?, ?, ?, 'hosted_push', 'dispatched', ?, ?, ?, ?) ON CONFLICT(session_id) DO NOTHING",
        [
          taskId,
          input.sessionId,
          input.listingId,
          input.listingVersion,
          now,
          input.briefHash,
          now,
          now,
        ],
      )
      .pipe(Effect.orDie);

    const card = yield* safeFetch(hosted.cardUrl, { purpose: "card" }, deps.fetchText);
    if (!card.ok) {
      yield* db
        .run(
          "UPDATE session_tasks SET state = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?",
          [`card_${card.reason}`, new Date().toISOString(), taskId],
        )
        .pipe(Effect.orDie);
      return yield* Effect.fail(
        new DispatchError({ reason: `card_${card.reason}` }),
      );
    }

    let cardJson: unknown;
    try {
      cardJson = JSON.parse(card.body);
    } catch {
      cardJson = null;
    }
    if (!isA2aTaskFrame(cardJson) || typeof (cardJson as { name?: unknown }).name !== "string") {
      yield* db
        .run(
          "UPDATE session_tasks SET state = 'failed', failure_reason = 'card_shape', updated_at = ? WHERE id = ?",
          [new Date().toISOString(), taskId],
        )
        .pipe(Effect.orDie);
      return yield* Effect.fail(new DispatchError({ reason: "card_shape" }));
    }

    const url = new URL("/message:stream", hosted.cardUrl).toString();
    const posted = yield* safePost(
      url,
      JSON.stringify({
        klawva: {
          sessionId: input.sessionId,
          taskId,
          brief: input.brief,
          briefHash: input.briefHash,
          limits: effectiveLimits(input.manifest),
          reportRequired: true,
        },
      }),
      { purpose: "card" },
      { "content-type": "application/a2a+json", accept: "text/event-stream" },
      deps.fetchText,
    );
    if (!posted.ok) {
      yield* db
        .run(
          "UPDATE session_tasks SET state = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?",
          [`post_${posted.reason}`, new Date().toISOString(), taskId],
        )
        .pipe(Effect.orDie);
      return yield* Effect.fail(
        new DispatchError({ reason: `post_${posted.reason}` }),
      );
    }
    const body = posted.body;

    const cancelled = yield* db
      .first(
        "SELECT cancel_requested_at AS requestedAt FROM session_tasks WHERE id = ?",
        [taskId],
      )
      .pipe(Effect.orDie);
    const frames = parseSse(body);
    let seq = 0;
    let artifact: { summary?: unknown; outcome?: unknown } | null = null;
    for (const frame of frames) {
      if (cancelled !== null && cancelled.requestedAt !== null) {
        yield* db
          .run(
            "UPDATE session_tasks SET state = 'cancelled', updated_at = ? WHERE id = ?",
            [new Date().toISOString(), taskId],
          )
          .pipe(Effect.orDie);
        return { taskId, state: "cancelled", replay: false };
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(frame.data);
      } catch {
        parsed = null;
      }
      const artifactUpdate =
        parsed !== null && typeof parsed === "object" && "artifactUpdate" in parsed
          ? (parsed as { artifactUpdate?: { artifact?: { parts?: ReadonlyArray<{ text?: string }> } } })
          : null;
      const text = artifactUpdate?.artifactUpdate?.artifact?.parts?.find(
        (part) => typeof part.text === "string",
      );
      if (text?.text !== undefined) {
        try {
          artifact = JSON.parse(text.text) as { summary?: unknown; outcome?: unknown };
        } catch {
          artifact = { summary: text.text };
        }
      }
      yield* db
        .run(
          "INSERT INTO task_events (id, task_id, seq, kind, payload, received_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(task_id, seq) DO NOTHING",
          [
            crypto.randomUUID(),
            taskId,
            seq,
            frame.event,
            frame.data.slice(0, 4_096),
            new Date().toISOString(),
          ],
        )
        .pipe(Effect.orDie);
      seq += 1;
    }

    const done = new Date().toISOString();
    yield* db
      .run(
        "UPDATE session_tasks SET state = ?, event_count = ?, last_event_at = ?, updated_at = ? WHERE id = ?",
        [artifact !== null ? "reported" : "working", seq, done, done, taskId],
      )
      .pipe(Effect.orDie);

    if (artifact !== null && deps.ingest !== undefined) {
      yield* deps.ingest({
        sessionId: input.sessionId,
        taskId,
        briefHash: input.briefHash,
        manifest: input.manifest,
        raw: JSON.stringify(artifact),
      }).pipe(Effect.catch(() => Effect.void));
    }

    const state = yield* taskState(db, taskId);
    return { taskId, state: state ?? "working", replay: false };
  });

export const taskState = (
  db: DatabaseImpl,
  taskId: string,
): Effect.Effect<string | null> =>
  db
    .first("SELECT state AS state FROM session_tasks WHERE id = ?", [taskId])
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row === null ? null : String(row.state))),
    );
