import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import type { Manifest } from "../db/schema.ts";
import { fileCallReport, validateReport, type Report } from "../report/report.ts";
import { safeFetch } from "../lib/safe-fetch.ts";

export type IngestOutcome =
  | { readonly ok: true; readonly reportId: string; readonly evidenceChecked: number }
  | { readonly ok: false; readonly reason: string; readonly failed: boolean };

export interface IngestInput {
  readonly sessionId: string;
  readonly taskId: string;
  readonly briefHash: string;
  readonly manifest: Manifest;
  readonly raw: string;
}

const limitsFor = (manifest: Manifest) => ({
  maxArtifactBytes: manifest.limits?.maxArtifactBytes ?? 65_536,
  maxEvents: manifest.limits?.maxEvents ?? 500,
});

const ArtifactJson = Schema.fromJsonString(Schema.Unknown);

const parseArtifact = (raw: string): unknown => {
  const decoded = Schema.decodeUnknownOption(ArtifactJson)(raw);
  return decoded._tag === "Some" ? decoded.value : null;
};

const ArtifactShape = Schema.Struct({
  outcome: Schema.optionalKey(Schema.String),
  summary: Schema.optionalKey(Schema.String),
  stats: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({ label: Schema.String, value: Schema.String }),
    ),
  ),
  evidence: Schema.optionalKey(Schema.Array(Schema.String)),
  limitations: Schema.optionalKey(Schema.Array(Schema.String)),
});

const asReport = (value: typeof ArtifactShape.Type): Report => ({
  outcome:
    value.outcome === "complete" ||
    value.outcome === "partial" ||
    value.outcome === "failed"
      ? value.outcome
      : undefined,
  summary: value.summary ?? "",
  stats: (value.stats ?? []).slice(0, 20),
  evidence: (value.evidence ?? []).slice(0, 20),
  limitations: (value.limitations ?? []).slice(0, 20),
});

export const artifactHashOf = (raw: string): Effect.Effect<string> =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(raw),
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  });

const stripMarkup = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeReport = (report: Report): Report => ({
  ...report,
  summary: stripMarkup(report.summary),
  evidence: (report.evidence ?? []).map((url) => url.trim()),
  limitations: (report.limitations ?? []).map(stripMarkup),
  stats: report.stats.map((stat) => ({
    label: stripMarkup(stat.label),
    value: stripMarkup(stat.value),
  })),
});

export const ingestArtifact = (
  db: DatabaseImpl,
  input: IngestInput,
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>,
): Effect.Effect<IngestOutcome> =>
  Effect.gen(function* () {
    const bytes = new TextEncoder().encode(input.raw).byteLength;
    if (bytes > limitsFor(input.manifest).maxArtifactBytes) {
      yield* markFailed(db, input.taskId, "artifact_too_large");
      return { ok: false as const, reason: "artifact_too_large", failed: true };
    }

    const decoded = Schema.decodeUnknownOption(ArtifactShape)(parseArtifact(input.raw));
    if (decoded._tag === "None") {
      yield* markFailed(db, input.taskId, "artifact_unparseable");
      return { ok: false as const, reason: "artifact_unparseable", failed: true };
    }
    const record = decoded.value;

    if (record.outcome === "failed") {
      yield* markFailed(db, input.taskId, String(record.summary ?? "author_failed"));
      return { ok: false as const, reason: "author_failed", failed: true };
    }

    const existing = yield* db
      .first(
        "SELECT id AS id FROM mission_reports WHERE task_id = ? LIMIT 1",
        [input.taskId],
      )
      .pipe(Effect.orDie);
    if (existing !== null) {
      return { ok: true as const, reportId: String(existing.id), evidenceChecked: 0 };
    }

    const report = sanitizeReport(asReport(record));
    const artifactHash = yield* artifactHashOf(input.raw);
    const verdict = validateReport(report, {
      taskId: input.taskId,
      briefHash: input.briefHash,
      artifactHash,
    });
    if (!verdict.ok) {
      yield* markFailed(db, input.taskId, verdict.reason);
      return { ok: false as const, reason: verdict.reason, failed: true };
    }

    let evidenceChecked = 0;
    for (const url of report.evidence ?? []) {
      const check = yield* safeFetch(url, { purpose: "evidence" }, fetchImpl);
      evidenceChecked += 1;
      yield* db
        .run(
          "INSERT INTO evidence_checks (id, report_id, url, status, resolved_at) VALUES (?, ?, ?, ?, ?)",
          [
            crypto.randomUUID(),
            input.taskId,
            url,
            check.ok ? check.status : 0,
            new Date().toISOString(),
          ],
        )
        .pipe(Effect.orDie);
      if (!check.ok || check.status < 200 || check.status >= 300) {
        yield* markFailed(db, input.taskId, "evidence_unresolved");
        return { ok: false as const, reason: "evidence_unresolved", failed: true };
      }
    }

    yield* fileCallReport(db, input.sessionId, input.taskId, report, {
      taskId: input.taskId,
      briefHash: input.briefHash,
      artifactHash,
    });

    const now = new Date().toISOString();
    yield* db
      .run(
        "UPDATE session_tasks SET state = 'completed', artifact_hash = ?, artifact_bytes = ?, updated_at = ? WHERE id = ? AND state != 'completed'",
        [artifactHash, bytes, now, input.taskId],
      )
      .pipe(Effect.orDie);

    return { ok: true as const, reportId: input.taskId, evidenceChecked };
  });

const markFailed = (
  db: DatabaseImpl,
  taskId: string,
  reason: string,
): Effect.Effect<void> =>
  db
    .run(
      "UPDATE session_tasks SET state = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?",
      [reason, new Date().toISOString(), taskId],
    )
    .pipe(Effect.orDie);
