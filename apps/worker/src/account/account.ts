import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

export const listAccountSessions = (
  db: DatabaseImpl,
  userId: string,
  email: string,
): Effect.Effect<ReadonlyArray<Readonly<Record<string, unknown>>>> =>
  db
    .all(
      "SELECT s.id AS id, s.state AS state, s.channel AS channel, s.window_start AS windowStart, s.window_end AS windowEnd, s.budget_minor AS budgetMinor, s.spent_minor AS spentMinor, s.created_at AS createdAt, l.name AS listingName, l.slug AS slug FROM sessions s LEFT JOIN agent_listings l ON l.id = s.listing_id WHERE s.user_id = ? OR (s.user_id IS NULL AND s.customer_email = ?) ORDER BY s.created_at DESC LIMIT 50",
      [userId, email],
    )
    .pipe(Effect.orDie);

export const accountSessionDetail = (
  db: DatabaseImpl,
  userId: string,
  email: string,
  sessionId: string,
): Effect.Effect<
  {
    readonly session: Readonly<Record<string, unknown>>;
    readonly transcript: ReadonlyArray<Readonly<Record<string, unknown>>>;
    readonly report: Readonly<Record<string, unknown>> | null;
  } | null
> =>
  Effect.gen(function* () {
    const session = yield* db
      .first(
        "SELECT s.id AS id, s.state AS state, s.channel AS channel, s.brief AS brief, s.window_start AS windowStart, s.window_end AS windowEnd, s.budget_minor AS budgetMinor, s.spent_minor AS spentMinor, s.created_at AS createdAt, l.name AS listingName, l.slug AS slug FROM sessions s LEFT JOIN agent_listings l ON l.id = s.listing_id WHERE s.id = ? AND (s.user_id = ? OR (s.user_id IS NULL AND s.customer_email = ?))",
        [sessionId, userId, email],
      )
      .pipe(Effect.orDie);
    if (session === null) {
      return null;
    }
    const transcript = yield* db
      .all(
        "SELECT role AS role, content AS content, created_at AS createdAt FROM messages WHERE session_id = ? ORDER BY created_at LIMIT 200",
        [sessionId],
      )
      .pipe(Effect.orDie);
    const report = yield* db
      .first(
        "SELECT summary AS summary, share_token AS shareToken, delivered_at AS deliveredAt FROM mission_reports WHERE session_id = ?",
        [sessionId],
      )
      .pipe(Effect.orDie);
    return { session, transcript, report };
  });

export const backfillSessionsForUser = (
  db: DatabaseImpl,
  userId: string,
  email: string,
): Effect.Effect<void> =>
  db
    .run(
      "UPDATE sessions SET user_id = ? WHERE user_id IS NULL AND customer_email = ?",
      [userId, email],
    )
    .pipe(Effect.orDie);
