import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

export interface CompletionSenders {
  readonly telegram: (chatId: string, text: string) => Effect.Effect<void>;
  readonly slack: (
    team: string,
    channel: string,
    text: string,
  ) => Effect.Effect<void>;
  readonly email: (address: string, reportUrl: string) => Effect.Effect<void>;
}

interface Target {
  readonly channel: string;
  readonly chatId: string;
}

const splitSlack = (
  chatId: string,
): { team: string; channel: string } | null => {
  const slash = chatId.indexOf(":");
  if (slash <= 0) {
    return null;
  }
  return { team: chatId.slice(0, slash), channel: chatId.slice(slash + 1) };
};

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
      const claimed = yield* params.db
        .changed(
          "INSERT INTO delivery_receipts (session_id, channel, chat_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(session_id, channel, chat_id) DO NOTHING",
          [
            params.sessionId,
            target.channel,
            target.chatId,
            new Date().toISOString(),
          ],
        )
        .pipe(Effect.orDie);
      if (claimed === 0) {
        continue;
      }
      if (target.channel === "telegram") {
        yield* params.senders.telegram(target.chatId, text);
      } else if (target.channel === "slack") {
        const parts = splitSlack(target.chatId);
        if (parts !== null) {
          yield* params.senders.slack(parts.team, parts.channel, text);
        }
      } else if (target.channel === "email") {
        yield* params.senders.email(target.chatId, params.reportUrl);
      }
    }
  });
