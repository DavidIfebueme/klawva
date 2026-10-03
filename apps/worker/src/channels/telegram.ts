import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";

export class TelegramError extends Schema.TaggedError<TelegramError>()(
  "TelegramError",
  {
    reason: Schema.String,
  },
) {}

export const secretHeader = "x-telegram-bot-api-secret-token";

export const TelegramUpdate = Schema.Struct({
  update_id: Schema.Number,
  message: Schema.optionalKey(
    Schema.Struct({
      message_id: Schema.Number,
      chat: Schema.Struct({ id: Schema.Number }),
      text: Schema.optionalKey(Schema.String),
      from: Schema.optionalKey(
        Schema.Struct({
          first_name: Schema.optionalKey(Schema.String),
          username: Schema.optionalKey(Schema.String),
        }),
      ),
    }),
  ),
});
export type TelegramUpdate = typeof TelegramUpdate.Type;

export const startPayload = (text: string): string | null => {
  if (!text.startsWith("/start")) {
    return null;
  }
  const payload = text.slice("/start".length).trim();
  return payload.length > 0 ? payload : null;
};

export const sendMessage = (
  token: string,
  chatId: number,
  text: string,
): Effect.Effect<void, TelegramError> =>
  Effect.tryPromise({
    try: async () => {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
      });
    },
    catch: (cause) => new TelegramError({ reason: String(cause) }),
  });

const SessionReply = Schema.Struct({ reply: Schema.optionalKey(Schema.String) });

const askSession = (
  env: Env,
  sessionId: string,
  content: string,
): Effect.Effect<string, TelegramError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await env.SESSION.get(
        env.SESSION.idFromName(sessionId),
      ).fetch("https://session/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content }),
      });
      const body: unknown = await response.json();
      const decoded = Schema.decodeUnknownOption(SessionReply)(body);
      return decoded._tag === "Some"
        ? decoded.value.reply ?? "Working on it."
        : "Working on it.";
    },
    catch: (cause) => new TelegramError({ reason: String(cause) }),
  });

export const handleUpdate = (
  env: Env,
  db: DatabaseImpl,
  update: TelegramUpdate,
): Effect.Effect<void, TelegramError> =>
  Effect.gen(function* () {
    const message = update.message;
    if (message === undefined || message.text === undefined) {
      return;
    }
    const chatId = message.chat.id;
    const text = message.text;
    const token = env.TELEGRAM_BOT_TOKEN;
    const payload = startPayload(text);
    if (payload !== null) {
      const now = new Date().toISOString();
      yield* db
        .run(
          "INSERT INTO channel_links (id, session_id, channel, chat_id, status, created_at, updated_at) VALUES (?, ?, 'telegram', ?, 'linked', ?, ?) ON CONFLICT(channel, chat_id, session_id) DO UPDATE SET status = 'linked', updated_at = excluded.updated_at",
          [crypto.randomUUID(), payload, String(chatId), now, now],
        )
        .pipe(Effect.orDie);
      const reply = yield* askSession(
        env,
        payload,
        "Introduce yourself and confirm you understand the brief.",
      );
      yield* sendMessage(token, chatId, reply);
      return;
    }
    const link = yield* db
      .first(
        "SELECT session_id FROM channel_links WHERE channel = 'telegram' AND chat_id = ? LIMIT 1",
        [String(chatId)],
      )
      .pipe(Effect.orDie);
    if (link === null) {
      yield* sendMessage(
        token,
        chatId,
        "This chat is not linked to a Klawva worker. Open your hire link to start.",
      );
      return;
    }
    const reply = yield* askSession(env, String(link.session_id), text);
    yield* sendMessage(token, chatId, reply);
  });
