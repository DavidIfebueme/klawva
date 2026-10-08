import { linkChannel } from "../account/account.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";
import { toTelegramHtml } from "../lib/markdown.ts";

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

const postMessage = (
  token: string,
  body: Record<string, unknown>,
): Effect.Effect<boolean, TelegramError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return response.ok;
    },
    catch: (cause) =>
      new TelegramError({ reason: String(cause).split(token).join("[token]") }),
  });

export const sendMessage = (
  token: string,
  chatId: number,
  text: string,
): Effect.Effect<void, TelegramError> =>
  Effect.gen(function* () {
    const html = toTelegramHtml(text);
    const formatted = yield* postMessage(token, {
      chat_id: chatId,
      text: html.slice(0, 4096),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }).pipe(Effect.catch(() => Effect.succeed(false)));
    if (formatted) {
      return;
    }
    const plain = yield* postMessage(token, {
      chat_id: chatId,
      text: text.slice(0, 4096),
    });
    if (!plain) {
      return yield* Effect.fail(
        new TelegramError({ reason: "telegram_rejected" }),
      );
    }
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

interface LinkedSession {
  readonly sessionId: string;
}

const linkedSessions = (
  db: DatabaseImpl,
  chatId: number,
): Effect.Effect<ReadonlyArray<LinkedSession>> =>
  db
    .all(
      "SELECT cl.session_id AS sessionId FROM channel_links cl WHERE cl.channel = 'telegram' AND cl.chat_id = ? ORDER BY cl.created_at DESC",
      [String(chatId)],
    )
    .pipe(
      Effect.orDie,
      Effect.map((rows) =>
        rows.map((row) => ({ sessionId: String(row.sessionId) })),
      ),
    );

const activeSession = (
  db: DatabaseImpl,
  chatId: number,
): Effect.Effect<string | null> =>
  db
    .first(
      "SELECT session_id AS sessionId FROM chat_active_session WHERE channel = 'telegram' AND chat_id = ?",
      [String(chatId)],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) => (row === null ? null : String(row.sessionId))),
    );

const setActive = (
  db: DatabaseImpl,
  chatId: number,
  sessionId: string,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO chat_active_session (channel, chat_id, session_id, updated_at) VALUES ('telegram', ?, ?, ?) ON CONFLICT(channel, chat_id) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at",
      [String(chatId), sessionId, new Date().toISOString()],
    )
    .pipe(Effect.orDie);

const label = (name: string | null, createdAt: string): string => {
  const suffix = name ?? "Employee";
  const when = createdAt.slice(0, 16).replace("T", " ");
  return `${suffix} · ${when}`;
};

const resolveSession = (
  db: DatabaseImpl,
  chatId: number,
): Effect.Effect<string | null> =>
  Effect.gen(function* () {
    const active = yield* activeSession(db, chatId);
    if (active !== null) {
      return active;
    }
    const links = yield* linkedSessions(db, chatId);
    if (links.length === 0) {
      return null;
    }
    const first = links[0];
    if (first === undefined) {
      return null;
    }
    yield* setActive(db, chatId, first.sessionId);
    return first.sessionId;
  });

const redeem = (
  env: Env,
  db: DatabaseImpl,
  chatId: number,
  code: string,
): Effect.Effect<void, TelegramError> =>
  Effect.gen(function* () {
    const token = env.TELEGRAM_BOT_TOKEN;
    const now = new Date().toISOString();
    const claim = yield* db
      .first(
        "SELECT session_id AS sessionId, email AS email, used_at AS usedAt, expires_at AS expiresAt FROM claim_tokens WHERE token = ?",
        [code],
      )
      .pipe(Effect.orDie);
    if (
      claim === null ||
      claim.usedAt !== null ||
      String(claim.expiresAt) < now
    ) {
      yield* sendMessage(
        token,
        chatId,
        "That launch code is invalid or has expired. Open your hire link again to get a fresh one.",
      );
      return;
    }
    const sessionId = String(claim.sessionId);
    const claimed = yield* db
      .changed(
        "UPDATE claim_tokens SET used_at = ? WHERE token = ? AND used_at IS NULL",
        [now, code],
      )
      .pipe(Effect.orDie);
    if (claimed === 0) {
      yield* sendMessage(
        token,
        chatId,
        "That launch code has already been used.",
      );
      return;
    }
    yield* linkChannel(db, sessionId, "telegram", String(chatId));
    yield* setActive(db, chatId, sessionId);
    const reply = yield* askSession(
      env,
      sessionId,
      "Introduce yourself and confirm you understand the brief.",
    );
    yield* sendMessage(token, chatId, reply);
  });

const listSessions = (
  env: Env,
  db: DatabaseImpl,
  chatId: number,
): Effect.Effect<void, TelegramError> =>
  Effect.gen(function* () {
    const rows = yield* db
      .all(
        "SELECT cl.session_id AS sessionId, s.state AS state, s.created_at AS createdAt, l.name AS name FROM channel_links cl LEFT JOIN sessions s ON s.id = cl.session_id LEFT JOIN agent_listings l ON l.id = s.listing_id WHERE cl.channel = 'telegram' AND cl.chat_id = ? ORDER BY cl.created_at DESC",
        [String(chatId)],
      )
      .pipe(Effect.orDie);
    if (rows.length === 0) {
      yield* sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "No employees are linked to this chat yet. Open your hire link to start.",
      );
      return;
    }
    const active = yield* activeSession(db, chatId);
    const lines = rows.map((row, index) => {
      const id = String(row.sessionId);
      const marker = id === active ? " (active)" : "";
      return `${index + 1}. ${label(row.name === null ? null : String(row.name), String(row.createdAt))}${marker}`;
    });
    yield* sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      `Your employees:\n${lines.join("\n")}\n\nUse /switch <number> to change the active one.`,
    );
  });

const switchSession = (
  env: Env,
  db: DatabaseImpl,
  chatId: number,
  argument: string,
): Effect.Effect<void, TelegramError> =>
  Effect.gen(function* () {
    const rows = yield* linkedSessions(db, chatId);
    const index = Number(argument) - 1;
    const target = rows[index];
    if (target === undefined) {
      yield* sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "Pick a number from /sessions.",
      );
      return;
    }
    yield* setActive(db, chatId, target.sessionId);
    yield* sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Switched. Say something to continue.");
  });

const status = (
  env: Env,
  db: DatabaseImpl,
  chatId: number,
  sessionId: string,
): Effect.Effect<void, TelegramError> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT s.state AS state, s.window_end AS windowEnd, s.budget_minor AS budgetMinor, s.spent_minor AS spentMinor, l.name AS name FROM sessions s LEFT JOIN agent_listings l ON l.id = s.listing_id WHERE s.id = ?",
        [sessionId],
      )
      .pipe(Effect.orDie);
    if (row === null) {
      yield* sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Session not found.");
      return;
    }
    yield* sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      `${row.name ?? "Employee"}\nState: ${row.state}\nSpend: ${Number(row.spentMinor)} of ${Number(row.budgetMinor)}\nEnds: ${row.windowEnd ?? "not started"}`,
    );
  });

const report = (
  env: Env,
  db: DatabaseImpl,
  chatId: number,
  sessionId: string,
): Effect.Effect<void, TelegramError> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT share_token AS shareToken FROM mission_reports WHERE session_id = ?",
        [sessionId],
      )
      .pipe(Effect.orDie);
    if (row === null) {
      yield* sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "No report yet. It arrives when the shift ends.",
      );
      return;
    }
    yield* sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      `${env.FRONTEND_BASE_URL}/report/${sessionId}?shareToken=${String(row.shareToken)}`,
    );
  });

const helpText =
  "Commands:\n/sessions list your employees\n/switch <n> change the active one\n/status show the active session\n/report resend the report\n/help this list\n\nAny other message goes to the active employee.";

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
    const text = message.text.trim();
    const token = env.TELEGRAM_BOT_TOKEN;

    if (text.startsWith("/start")) {
      const code = text.slice("/start".length).trim();
      if (code.length === 0) {
        yield* sendMessage(
          token,
          chatId,
          "Open the launch link from your receipt, or send /start with your code.",
        );
        return;
      }
      yield* redeem(env, db, chatId, code);
      return;
    }

    const sessionId = yield* resolveSession(db, chatId);
    if (sessionId === null) {
      yield* sendMessage(
        token,
        chatId,
        "This chat is not linked to a Klawva employee. Open your hire link to start.",
      );
      return;
    }

    if (text === "/help") {
      yield* sendMessage(token, chatId, helpText);
      return;
    }
    if (text === "/sessions") {
      yield* listSessions(env, db, chatId);
      return;
    }
    if (text.startsWith("/switch")) {
      yield* switchSession(env, db, chatId, text.slice("/switch".length).trim());
      return;
    }
    if (text === "/status") {
      yield* status(env, db, chatId, sessionId);
      return;
    }
    if (text === "/report") {
      yield* report(env, db, chatId, sessionId);
      return;
    }

    const reply = yield* askSession(env, sessionId, text);
    yield* sendMessage(token, chatId, reply);
  });
