import * as Effect from "effect/Effect";
import { make as makeDatabase } from "../db/database.ts";
import { liveSessionStates } from "../db/schema.ts";
import { sendEmail } from "../email/brevo.ts";
import { shiftEndingEmail } from "../email/templates.ts";
import type { Env } from "../env.ts";

const dayMs = 24 * 60 * 60 * 1000;

export interface SweepResult {
  readonly ended: number;
}

const callSession = (
  env: Env,
  sessionId: string,
  path: string,
): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: async () => {
      const response = await env.SESSION.get(
        env.SESSION.idFromName(sessionId),
      ).fetch(`https://session${path}`, { method: "POST" });
      return response.ok;
    },
    catch: (cause) => new Error(String(cause)),
  }).pipe(Effect.catch(() => Effect.succeed(false)));

export const sweep = (env: Env): Effect.Effect<SweepResult> =>
  Effect.gen(function* () {
    const db = makeDatabase(env.DB);
    const now = new Date().toISOString();
    const unpaidCutoff = new Date(Date.now() - 7 * dayMs).toISOString();
    const transcriptCutoff = new Date(Date.now() - 7 * dayMs).toISOString();
    const reportCutoff = new Date(Date.now() - 90 * dayMs).toISOString();
    const live: ReadonlyArray<string> = [...liveSessionStates];
    const liveSlots = live.map(() => "?").join(", ");

    const unpaid = yield* db
      .all(
        "SELECT id AS id FROM sessions WHERE state = 'pending' AND created_at < ?",
        [unpaidCutoff],
      )
      .pipe(Effect.orDie);
    if (unpaid.length > 0) {
      yield* Effect.forEach(
        unpaid,
        (row) => callSession(env, String(row.id), "/expire"),
        { concurrency: 3 },
      );
    }

    const due = yield* db
      .all(
        `SELECT id AS id FROM sessions WHERE state IN (${liveSlots}) AND window_end IS NOT NULL AND window_end < ?`,
        [...live, now],
      )
      .pipe(Effect.orDie);
    let ended = 0;
    if (due.length > 0) {
      const reported = yield* Effect.forEach(
        due,
        (row) => callSession(env, String(row.id), "/report"),
        { concurrency: 3 },
      );
      ended = reported.filter((ok) => ok).length;
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
        `SELECT s.id AS id, s.customer_email AS email, s.window_end AS windowEnd, l.name AS name FROM sessions s LEFT JOIN agent_listings l ON l.id = s.listing_id WHERE s.state IN (${liveSlots}) AND s.window_end IS NOT NULL AND s.window_end < ? AND s.window_end > ? AND s.nearing_notified_at IS NULL`,
        [...live, soon, now],
      )
      .pipe(Effect.orDie);

    if (nearing.length > 0) {
      const ids = nearing.map((row) => String(row.id));
      const placeholders = ids.map(() => "?").join(", ");
      yield* db
        .run(
          `UPDATE sessions SET nearing_notified_at = ? WHERE id IN (${placeholders})`,
          [now, ...ids],
        )
        .pipe(Effect.orDie);
      yield* Effect.forEach(
        nearing,
        (row) => {
          if (row.email === null) {
            return Effect.void;
          }
          return sendEmail({
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
        },
        { concurrency: 5 },
      );
    }

    return { ended };
  });
