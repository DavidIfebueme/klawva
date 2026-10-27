import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import type { Manifest } from "../db/schema.ts";
import { ingestArtifact } from "./ingest.ts";
import { appendEvent } from "./events.ts";
import { issueJobToken, jobTokenExpiry, listingForToken, taskForJobToken } from "./tokens.ts";
import * as Schema from "effect/Schema";
import { manifestOf } from "../db/schema.ts";

const BatchPayload = Schema.fromJsonString(
  Schema.Struct({
    events: Schema.Array(
      Schema.Struct({
        id: Schema.optionalKey(Schema.String),
        kind: Schema.optionalKey(Schema.String),
        payload: Schema.optionalKey(Schema.String),
      }),
    ),
  }),
);

const maxClaimedEvents = 50;
const maxClaimedBytes = 65_536;

export interface PullResponse {
  readonly status: number;
  readonly body: unknown;
  readonly retryAfter?: number;
}

const json = (status: number, body: unknown, retryAfter?: number): PullResponse => ({
  status,
  body,
  ...(retryAfter === undefined ? {} : { retryAfter }),
});

export const claimTask = (
  db: DatabaseImpl,
  listingToken: string,
): Effect.Effect<PullResponse> =>
  Effect.gen(function* () {
    const listingId = yield* listingForToken(db, listingToken);
    if (listingId === null) {
      return json(401, { error: "bad_token" });
    }
    const task = yield* db
      .first(
        "SELECT t.id AS id, t.session_id AS sessionId, t.state AS state, t.brief_hash AS briefHash, t.listing_version AS version, s.brief AS brief FROM session_tasks t JOIN sessions s ON s.id = t.session_id WHERE t.listing_id = ? AND t.carrier = 'hosted_pull' AND t.state IN ('dispatched','working') ORDER BY t.created_at LIMIT 1",
        [listingId],
      )
      .pipe(Effect.orDie);
    if (task === null) {
      return json(204, null, 15);
    }
    const windowEnd = yield* db
      .first(
        "SELECT s.window_end AS windowEnd FROM session_tasks t JOIN sessions s ON s.id = t.session_id WHERE t.id = ?",
        [String(task.id)],
      )
      .pipe(Effect.orDie);
    const expiresAt = jobTokenExpiry(new Date(), 26);
    const shiftBound =
      windowEnd === null || windowEnd.windowEnd === null
        ? expiresAt
        : new Date(
            Math.min(
              Date.parse(String(windowEnd.windowEnd)) + 60 * 60 * 1_000,
              Date.parse(expiresAt),
            ),
          ).toISOString();
    // always mint on claim: the token is stored hashed, so a client that restarted
    // cannot recover the old one, and a null token would wedge the task forever.
    const jobToken = yield* issueJobToken(db, String(task.id), shiftBound);
    yield* db
      .run(
        "UPDATE session_tasks SET state = 'working', updated_at = ? WHERE id = ? AND state = 'dispatched'",
        [new Date().toISOString(), String(task.id)],
      )
      .pipe(Effect.orDie);
    return json(200, {
      taskId: String(task.id),
      sessionId: String(task.sessionId),
      state: String(task.state),
      briefHash: String(task.briefHash ?? ""),
      brief: task.brief,
      jobToken,
      limits: { maxEvents: maxClaimedEvents, maxBytes: maxClaimedBytes },
    });
  });

export const submitEvents = (
  db: DatabaseImpl,
  taskId: string,
  jobToken: string,
  raw: string,
): Effect.Effect<PullResponse> =>
  Effect.gen(function* () {
    const allowed = yield* taskForJobToken(db, jobToken);
    if (allowed === null || allowed !== taskId) {
      return json(401, { error: "bad_token" });
    }
    if (new TextEncoder().encode(raw).byteLength > maxClaimedBytes) {
      return json(413, { error: "too_large" });
    }
    const decoded = Schema.decodeUnknownOption(BatchPayload)(raw);
    if (decoded._tag === "None") {
      return json(400, { error: "bad_json" });
    }
    const events = decoded.value.events;
    if (events.length === 0 || events.length > maxClaimedEvents) {
      return json(400, { error: "bad_event_count" });
    }
    for (const event of events) {
      const kind = event.kind ?? "message";
      const payload = event.payload ?? "";
      const eventId = event.id ?? null;
      if (eventId !== null) {
        const seen = yield* db
          .first(
            "SELECT id AS id FROM task_events WHERE task_id = ? AND payload = ? LIMIT 1",
            [taskId, `id:${eventId}`],
          )
          .pipe(Effect.orDie);
        if (seen !== null) {
          continue;
        }
      }
      const result = yield* appendEvent(db, {
        taskId,
        kind,
        payload,
        maxEvents: 500,
        maxEventBytes: 4_096,
      });
      if (result === "event_cap") {
        return json(409, { error: "event_cap" });
      }
    }
    return json(200, { ok: true });
  });

export const submitReport = (
  db: DatabaseImpl,
  taskId: string,
  jobToken: string,
  raw: string,
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>,
): Effect.Effect<PullResponse> =>
  Effect.gen(function* () {
    const allowed = yield* taskForJobToken(db, jobToken);
    if (allowed === null || allowed !== taskId) {
      return json(401, { error: "bad_token" });
    }
    const task = yield* db
      .first(
        "SELECT session_id AS sessionId, brief_hash AS briefHash, listing_id AS listingId, listing_version AS version FROM session_tasks WHERE id = ?",
        [taskId],
      )
      .pipe(Effect.orDie);
    if (task === null) {
      return json(404, { error: "task_not_found" });
    }
    const version = yield* db
      .first(
        "SELECT manifest AS manifest, soul AS soul FROM listing_versions WHERE listing_id = ? AND version = ?",
        [String(task.listingId), Number(task.version)],
      )
      .pipe(Effect.orDie);
    const manifest = manifestOf({
      soul: version === null ? "" : String(version.soul ?? ""),
      manifest:
        version === null || version.manifest === null
          ? null
          : String(version.manifest),
    });
    const outcome = yield* ingestArtifact(
      db,
      {
        sessionId: String(task.sessionId),
        taskId,
        briefHash: String(task.briefHash ?? ""),
        manifest,
        raw,
      },
      fetchImpl,
    );
    return outcome.ok ? json(200, { ok: true }) : json(409, { error: outcome.reason });
  });

export const readTask = (
  db: DatabaseImpl,
  taskId: string,
  jobToken: string,
): Effect.Effect<PullResponse> =>
  Effect.gen(function* () {
    const allowed = yield* taskForJobToken(db, jobToken);
    if (allowed === null || allowed !== taskId) {
      return json(401, { error: "bad_token" });
    }
    const row = yield* db
      .first(
        "SELECT state AS state, event_count AS events, failure_reason AS failureReason FROM session_tasks WHERE id = ?",
        [taskId],
      )
      .pipe(Effect.orDie);
    return row === null
      ? json(404, { error: "task_not_found" })
      : json(200, row);
  });

export const hostedManifestOf = (manifest: Manifest): Manifest => manifest;
