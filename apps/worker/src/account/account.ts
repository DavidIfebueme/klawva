import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";
import type { LinkChannel } from "../db/schema.ts";

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

export const ownsSession = (
  db: DatabaseImpl,
  userId: string,
  email: string,
  sessionId: string,
): Effect.Effect<boolean> =>
  db
    .first(
      "SELECT id AS id FROM sessions WHERE id = ? AND (user_id = ? OR (user_id IS NULL AND customer_email = ?))",
      [sessionId, userId, email],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => row !== null),
    );

export const sessionTokenMatches = (
  db: DatabaseImpl,
  sessionId: string,
  token: string,
): Effect.Effect<boolean> =>
  db
    .first("SELECT id AS id FROM sessions WHERE id = ? AND session_token = ?", [
      sessionId,
      token,
    ])
    .pipe(
      Effect.orDie,
      Effect.map((row) => row !== null),
    );

export const listMembers = (
  db: DatabaseImpl,
  sessionId: string,
): Effect.Effect<ReadonlyArray<Readonly<Record<string, unknown>>>> =>
  db
    .all(
      "SELECT email AS email, role AS role FROM session_members WHERE session_id = ? ORDER BY created_at",
      [sessionId],
    )
    .pipe(Effect.orDie);

export const addMember = (
  db: DatabaseImpl,
  sessionId: string,
  email: string,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO session_members (id, session_id, email, role, created_at) VALUES (?, ?, ?, 'member', ?) ON CONFLICT(session_id, email) DO NOTHING",
      [crypto.randomUUID(), sessionId, email.trim().toLowerCase(), new Date().toISOString()],
    )
    .pipe(Effect.orDie);

export const removeMember = (
  db: DatabaseImpl,
  sessionId: string,
  email: string,
): Effect.Effect<void> =>
  db
    .run("DELETE FROM session_members WHERE session_id = ? AND email = ?", [
      sessionId,
      email.trim().toLowerCase(),
    ])
    .pipe(Effect.orDie);

export const linkChannel = (
  db: DatabaseImpl,
  sessionId: string,
  channel: LinkChannel,
  chatId: string,
): Effect.Effect<void> => {
  const now = new Date().toISOString();
  return db
    .run(
      "INSERT INTO channel_links (id, session_id, channel, chat_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'linked', ?, ?) ON CONFLICT(channel, chat_id, session_id) DO UPDATE SET updated_at = excluded.updated_at",
      [crypto.randomUUID(), sessionId, channel, chatId, now, now],
    )
    .pipe(Effect.orDie);
};

export const listChannelLinks = (
  db: DatabaseImpl,
  sessionId: string,
): Effect.Effect<ReadonlyArray<Readonly<Record<string, unknown>>>> =>
  db
    .all(
      "SELECT channel AS channel, chat_id AS chatId, created_at AS createdAt FROM channel_links WHERE session_id = ? AND status = 'linked' ORDER BY created_at",
      [sessionId],
    )
    .pipe(Effect.orDie);

export const unlinkChannel = (
  db: DatabaseImpl,
  sessionId: string,
  channel: LinkChannel,
  chatId: string,
): Effect.Effect<void> => {
  const now = new Date().toISOString();
  return db
    .batch([
      {
        sql: "UPDATE channel_links SET status = 'unlinked', updated_at = ? WHERE session_id = ? AND channel = ? AND chat_id = ?",
        params: [now, sessionId, channel, chatId],
      },
      {
        sql: "DELETE FROM chat_active_session WHERE session_id = ? AND channel = ? AND chat_id = ?",
        params: [sessionId, channel, chatId],
      },
    ])
    .pipe(Effect.orDie);
};
