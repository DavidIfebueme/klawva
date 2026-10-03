import * as Effect from "effect/Effect";
import { make as makeDatabase } from "../db/database.ts";
import { sendEmail } from "../email/brevo.ts";
import { shiftEndingEmail } from "../email/templates.ts";
import type { Env } from "../env.ts";

const dayMs = 24 * 60 * 60 * 1000;

export interface SweepResult {
  readonly ended: number;
}

export const sweep = (env: Env): Effect.Effect<SweepResult> =>
  Effect.gen(function* () {
    const db = makeDatabase(env.DB);
    const now = new Date().toISOString();
    const unpaidCutoff = new Date(Date.now() - 7 * dayMs).toISOString();
    const transcriptCutoff = new Date(Date.now() - 7 * dayMs).toISOString();
    const reportCutoff = new Date(Date.now() - 90 * dayMs).toISOString();

    yield* db
      .run(
        "UPDATE sessions SET state = 'expired', updated_at = ? WHERE state = 'pending' AND created_at < ?",
        [now, unpaidCutoff],
      )
      .pipe(Effect.orDie);

    const due = yield* db
      .all(
        "SELECT id AS id FROM sessions WHERE state IN ('active', 'ready') AND window_end IS NOT NULL AND window_end < ?",
        [now],
      )
      .pipe(Effect.orDie);

    for (const row of due) {
      const id = String(row.id);
      yield* Effect.tryPromise({
        try: () =>
          env.SESSION.get(env.SESSION.idFromName(id)).fetch(
            "https://session/report",
            { method: "POST" },
          ),
        catch: (cause) => new Error(String(cause)),
      }).pipe(Effect.catch(() => Effect.void));
      yield* db
        .run("UPDATE sessions SET state = 'completed', updated_at = ? WHERE id = ?", [
          now,
          id,
        ])
        .pipe(Effect.orDie);
    }

    yield* db
      .run(
        "DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE window_end IS NOT NULL AND window_end < ?)",
        [transcriptCutoff],
      )
      .pipe(Effect.orDie);

    yield* db
      .run("DELETE FROM mission_reports WHERE created_at < ?", [reportCutoff])
      .pipe(Effect.orDie);

    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const nearing = yield* db
      .all(
        "SELECT s.id AS id, s.customer_email AS email, s.window_end AS windowEnd, l.name AS name FROM sessions s LEFT JOIN agent_listings l ON l.id = s.listing_id WHERE s.state IN ('active', 'ready') AND s.window_end IS NOT NULL AND s.window_end < ? AND s.window_end > ? AND s.nearing_notified_at IS NULL",
        [soon, now],
      )
      .pipe(Effect.orDie);
    for (const row of nearing) {
      const id = String(row.id);
      yield* db
        .run("UPDATE sessions SET nearing_notified_at = ? WHERE id = ?", [now, id])
        .pipe(Effect.orDie);
      if (row.email !== null) {
        yield* sendEmail({
          apiKey: env.BREVO_API_KEY,
          senderEmail: env.BREVO_SENDER_EMAIL,
          senderName: "Klawva",
          toEmail: String(row.email),
          subject: "Your shift is almost over",
          html: shiftEndingEmail(
            row.name === null ? "Your employee" : String(row.name),
            String(row.windowEnd),
          ),
        }).pipe(Effect.catch(() => Effect.void));
      }
    }

    return { ended: due.length };
  });
