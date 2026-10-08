import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";

export class DeliveryError extends Schema.TaggedError<DeliveryError>()(
  "DeliveryError",
  {
    channel: Schema.String,
    reason: Schema.String,
  },
) {}

export interface CompletionSenders {
  readonly telegram: (
    chatId: string,
    text: string,
  ) => Effect.Effect<void, DeliveryError>;
  readonly slack: (
    team: string,
    channel: string,
    text: string,
  ) => Effect.Effect<void, DeliveryError>;
  readonly email: (
    address: string,
    reportUrl: string,
  ) => Effect.Effect<void, DeliveryError>;
}

interface Target {
  readonly channel: string;
  readonly chatId: string;
}

const claimLeaseMs = 5 * 60 * 1000;

const splitSlack = (
  chatId: string,
): { team: string; channel: string } | null => {
  const slash = chatId.indexOf(":");
  if (slash <= 0) {
    return null;
  }
  return { team: chatId.slice(0, slash), channel: chatId.slice(slash + 1) };
};

const send = (
  senders: CompletionSenders,
  target: Target,
  text: string,
  reportUrl: string,
): Effect.Effect<void, DeliveryError> => {
  if (target.channel === "telegram") {
    return senders.telegram(target.chatId, text);
  }
  if (target.channel === "slack") {
    const parts = splitSlack(target.chatId);
    return parts === null
      ? Effect.void
      : senders.slack(parts.team, parts.channel, text);
  }
  if (target.channel === "email") {
    return senders.email(target.chatId, reportUrl);
  }
  return Effect.void;
};

const claim = (
  db: DatabaseImpl,
  sessionId: string,
  target: Target,
  now: number,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const inserted = yield* db
      .changed(
        "INSERT INTO delivery_receipts (session_id, channel, chat_id, created_at, delivered_at) VALUES (?, ?, ?, ?, NULL) ON CONFLICT(session_id, channel, chat_id) DO NOTHING",
        [sessionId, target.channel, target.chatId, new Date(now).toISOString()],
      )
      .pipe(Effect.orDie);
    if (inserted === 1) {
      return true;
    }
    const existing = yield* db
      .first(
        "SELECT delivered_at AS deliveredAt, created_at AS createdAt FROM delivery_receipts WHERE session_id = ? AND channel = ? AND chat_id = ?",
        [sessionId, target.channel, target.chatId],
      )
      .pipe(Effect.orDie);
    if (existing === null) {
      return false;
    }
    if (existing.deliveredAt !== null) {
      return false;
    }
    const claimedAt = Date.parse(String(existing.createdAt));
    if (Number.isFinite(claimedAt) && now - claimedAt < claimLeaseMs) {
      return false;
    }
    yield* db
      .run(
        "DELETE FROM delivery_receipts WHERE session_id = ? AND channel = ? AND chat_id = ?",
        [sessionId, target.channel, target.chatId],
      )
      .pipe(Effect.orDie);
    const reclaimed = yield* db
      .changed(
        "INSERT INTO delivery_receipts (session_id, channel, chat_id, created_at, delivered_at) VALUES (?, ?, ?, ?, NULL) ON CONFLICT(session_id, channel, chat_id) DO NOTHING",
        [sessionId, target.channel, target.chatId, new Date(now).toISOString()],
      )
      .pipe(Effect.orDie);
    return reclaimed === 1;
  });

export const deliverCompletion = (params: {
  readonly db: DatabaseImpl;
  readonly senders: CompletionSenders;
  readonly sessionId: string;
  readonly reportUrl: string;
  readonly email: string | null;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const targets: Target[] = [];
    if (params.email !== null && params.email.length > 0) {
      targets.push({ channel: "email", chatId: params.email });
    }
    const links = yield* params.db
      .all(
        "SELECT channel AS channel, chat_id AS chatId FROM channel_links WHERE session_id = ? AND status = 'linked'",
        [params.sessionId],
      )
      .pipe(Effect.orDie);
    for (const row of links) {
      targets.push({
        channel: String(row.channel),
        chatId: String(row.chatId),
      });
    }
    const text = `Your shift is complete. Here is your report: ${params.reportUrl}`;
    for (const target of targets) {
      const now = Date.now();
      if (!(yield* claim(params.db, params.sessionId, target, now))) {
        continue;
      }
      const outcome = yield* Effect.result(
        send(params.senders, target, text, params.reportUrl),
      );
      if (outcome._tag === "Success") {
        yield* params.db
          .run(
            "UPDATE delivery_receipts SET delivered_at = ? WHERE session_id = ? AND channel = ? AND chat_id = ?",
            [
              new Date().toISOString(),
              params.sessionId,
              target.channel,
              target.chatId,
            ],
          )
          .pipe(Effect.orDie);
        continue;
      }
      yield* params.db
        .run(
          "DELETE FROM delivery_receipts WHERE session_id = ? AND channel = ? AND chat_id = ?",
          [params.sessionId, target.channel, target.chatId],
        )
        .pipe(Effect.orDie);
    }
  });
