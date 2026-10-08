import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServer } from "effect/http";
import * as HttpServerError from "effect/http/HttpServerError";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import { SessionState } from "../db/schema.ts";
import { sessionTokenMatches, ownsSession } from "../account/account.ts";
import { identityFromToken } from "../auth/auth.ts";
import {
  defaultModel,
  defaultToolAllowlist,
  makeRuntime,
  ModelError,
  resolveAllowlist,
  runTurn,
} from "../agent/runtime.ts";
import { make as makeDatabase, type DatabaseImpl } from "../db/database.ts";
import {
  charsToTokens,
  checkNeuronBudget,
  recordAiUsage,
} from "../agent/meter.ts";
import { screenScope, steerReply } from "../moderation/moderation.ts";
import { fallbackReport, generateReport } from "../report/report.ts";
import { reportEmailHtml, sendEmail } from "../email/brevo.ts";
import { sendMessage } from "../channels/telegram.ts";
import { postMessage } from "../channels/slack.ts";
import { deliverCompletion, DeliveryError } from "../channels/delivery.ts";
import type { Env } from "../env.ts";
import type { UIMessage } from "ai";

export class IllegalTransition extends Schema.TaggedError<IllegalTransition>()(
  "IllegalTransition",
  {
    from: Schema.String,
    to: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class BudgetExhausted extends Schema.TaggedError<BudgetExhausted>()(
  "BudgetExhausted",
  {
    budgetMinor: Schema.Number,
    spentMinor: Schema.Number,
  },
) {}

const transitions: Record<SessionState, ReadonlyArray<SessionState>> = {
  pending: ["provisioning", "failed"],
  provisioning: ["active", "failed"],
  active: ["hibernating", "recovering", "completed", "failed"],
  hibernating: ["recovering", "completed", "failed"],
  recovering: ["active", "failed"],
  completed: [],
  failed: [],
};

export const canTransition = (from: SessionState, to: SessionState): boolean =>
  transitions[from].includes(to);

export const canSpend = (
  budgetMinor: number,
  spentMinor: number,
  amountMinor: number,
): boolean => spentMinor + amountMinor <= budgetMinor;

export const transition = (
  from: SessionState,
  to: SessionState,
): Effect.Effect<SessionState, IllegalTransition> =>
  canTransition(from, to)
    ? Effect.succeed(to)
    : Effect.fail(new IllegalTransition({ from, to }));

export interface StoredMessage {
  readonly role: string;
  readonly content: string;
}

export interface SessionStoreImpl {
  readonly get: (key: string) => Effect.Effect<string | null>;
  readonly set: (key: string, value: string) => Effect.Effect<void>;
  readonly append: (role: string, content: string) => Effect.Effect<void>;
  readonly history: () => Effect.Effect<ReadonlyArray<StoredMessage>>;
  readonly spend: (amountMinor: number) => Effect.Effect<void, BudgetExhausted>;
}

export class SessionStore extends Context.Service<SessionStore, SessionStoreImpl>()(
  "klawva/session/SessionStore",
) {}

const readMeta = (sql: SqlStorage, key: string): string | null => {
  const rows = sql.exec("SELECT value FROM session_meta WHERE key = ?", key).toArray();
  return rows[0] ? String(rows[0].value) : null;
};

export const makeStore = (sql: SqlStorage): SessionStoreImpl => ({
  get: (key) => Effect.sync(() => readMeta(sql, key)),
  set: (key, value) =>
    Effect.sync(() => {
      sql.exec(
        "INSERT INTO session_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        key,
        value,
      );
    }),
  append: (role, content) =>
    Effect.sync(() => {
      sql.exec(
        "INSERT INTO session_messages (id, role, content, created_at) VALUES (?, ?, ?, ?)",
        crypto.randomUUID(),
        role,
        content,
        new Date().toISOString(),
      );
    }),
  history: () =>
    Effect.sync(() =>
      sql
        .exec("SELECT role, content FROM session_messages ORDER BY created_at")
        .toArray()
        .map((row) => ({ role: String(row.role), content: String(row.content) })),
    ),
  spend: (amountMinor) =>
    Effect.gen(function* () {
      const budget = Number(readMeta(sql, "budget_minor") ?? "0");
      const spent = Number(readMeta(sql, "spent_minor") ?? "0");
      if (spent + amountMinor > budget) {
        return yield* Effect.fail(
          new BudgetExhausted({ budgetMinor: budget, spentMinor: spent }),
        );
      }
      yield* Effect.sync(() => {
        sql.exec(
          "INSERT INTO session_meta (key, value) VALUES ('spent_minor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          String(spent + amountMinor),
        );
      });
    }),
});

export class SessionEnv extends Context.Service<
  SessionEnv,
  { readonly env: Env; readonly sessionId: string }
>()("klawva/session/SessionEnv") {}

export interface TurnConfig {
  readonly soul: string;
  readonly brief: Readonly<Record<string, string>>;
  readonly allowlist: ReadonlyArray<string>;
  readonly model: string;
}

export const mirrorMessage = (
  db: DatabaseImpl,
  sessionId: string,
  role: string,
  content: string,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), sessionId, role, content, new Date().toISOString()],
    )
    .pipe(Effect.orDie);

export const loadTurnConfig = (
  store: SessionStoreImpl,
): Effect.Effect<TurnConfig> =>
  Effect.gen(function* () {
    const soul = (yield* store.get("soul")) ?? "";
    const brief = Schema.decodeUnknownSync(Brief)(
      JSON.parse((yield* store.get("brief")) ?? "{}"),
    );
    return {
      soul,
      brief,
      allowlist: resolveAllowlist(yield* store.get("tool_allowlist")),
      model: (yield* store.get("model")) ?? defaultModel,
    };
  });

export const capacityReply =
  "Klawva is at capacity for today. Please try again tomorrow.";

export const takeCapacitySlot = (
  db: DatabaseImpl,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const day = new Date().toISOString().slice(0, 10);
    const counterKey = `turns:${day}`;
    const counter = yield* db
      .first("SELECT value AS value FROM counters WHERE key = ?", [counterKey])
      .pipe(Effect.orDie);
    const used = counter === null ? 0 : Number(counter.value);
    if (used >= 5000) {
      return false;
    }
    yield* db
      .run(
        "INSERT INTO counters (key, value, updated_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET value = value + 1, updated_at = excluded.updated_at",
        [counterKey, new Date().toISOString()],
      )
      .pipe(Effect.orDie);
    return true;
  });

export type TurnAdmission =
  | { readonly _tag: "Rejected"; readonly reply: string }
  | { readonly _tag: "AtCapacity" }
  | { readonly _tag: "Admitted"; readonly config: TurnConfig };

export const admitTurn = (
  store: SessionStoreImpl,
  db: DatabaseImpl,
  sessionId: string,
  userText: string,
): Effect.Effect<TurnAdmission, BudgetExhausted> =>
  Effect.gen(function* () {
    const config = yield* loadTurnConfig(store);
    const verdict = screenScope(userText, config.brief);
    if (verdict !== "in_scope") {
      return { _tag: "Rejected", reply: steerReply(verdict) } as const;
    }
    if (!(yield* checkNeuronBudget(db))) {
      return { _tag: "AtCapacity" } as const;
    }
    if (!(yield* takeCapacitySlot(db))) {
      return { _tag: "AtCapacity" } as const;
    }
    yield* store.spend(50);
    yield* mirrorMessage(db, sessionId, "user", userText);
    return { _tag: "Admitted", config } as const;
  });

export const persistReply = (
  store: SessionStoreImpl,
  db: DatabaseImpl,
  sessionId: string,
  reply: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* store.append("assistant", reply);
    yield* mirrorMessage(db, sessionId, "assistant", reply);
  });

export const budgetReply =
  "This shift has used up its budget. Top up the wallet to keep the employee working.";

export const modelRetryReply =
  "My model dropped that turn. Send your message again and I'll pick it up.";

export const turnSucceeded = (
  status: string,
  failed: boolean,
): boolean => status === "completed" && !failed;

export const sanitized = (
  messages: ReadonlyArray<UIMessage>,
): Array<UIMessage> =>
  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      ...message,
      parts: message.parts.filter((part) => part.type === "text"),
    }));

export const persistAssistant = (
  store: SessionStoreImpl,
  db: DatabaseImpl,
  sessionId: string,
  text: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* store.append("assistant", text);
    yield* mirrorMessage(db, sessionId, "assistant", text);
  });

export const authorizeStream = (
  env: Env,
  db: DatabaseImpl,
  sessionId: string,
  token: string | null,
  authHeader: string | null,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    if (token !== null && token.length > 0) {
      const matches = yield* sessionTokenMatches(db, sessionId, token);
      if (matches) {
        return true;
      }
    }
    if (authHeader === null) {
      return false;
    }
    const clean =
      authHeader.toLowerCase().startsWith("bearer ") && authHeader.length > 7
        ? authHeader.slice(7).trim()
        : authHeader;
    const identity = yield* identityFromToken(env, db, clean).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );
    if (identity === null) {
      return false;
    }
    const owned = yield* ownsSession(db, identity.userId, identity.email, sessionId);
    return owned;
  });

export const messageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");

export const lastUserText = (messages: ReadonlyArray<UIMessage>): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message !== undefined && message.role === "user") {
      return messageText(message);
    }
  }
  return "";
};

export const completeShift = (
  store: SessionStoreImpl,
  env: Env,
  sessionId: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const history = yield* store.history();
    const runtime = makeRuntime(env.AI, defaultModel);
    const briefRaw = (yield* store.get("brief")) ?? "{}";
    const brief = Schema.decodeUnknownSync(Brief)(JSON.parse(briefRaw));
    const db = makeDatabase(env.DB);
    const inChars =
      history.reduce((n, m) => n + m.content.length, 0) +
      JSON.stringify(brief).length;
    const report = yield* generateReport({ runtime, history, brief }).pipe(
      Effect.tap((result) =>
        recordAiUsage(db, {
          model: defaultModel,
          inTokens: charsToTokens(inChars),
          outTokens: charsToTokens(result.summary.length),
          ok: true,
        }),
      ),
      Effect.catch(() =>
        recordAiUsage(db, {
          model: defaultModel,
          inTokens: charsToTokens(inChars),
          outTokens: 0,
          ok: false,
        }).pipe(Effect.andThen(() => Effect.succeed(fallbackReport(history)))),
      ),
    );
    const shareToken = crypto.randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    yield* db
      .run(
        "INSERT INTO mission_reports (id, session_id, summary, stats, share_token, delivered_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET summary = excluded.summary, stats = excluded.stats, delivered_at = excluded.delivered_at, updated_at = excluded.updated_at",
        [
          crypto.randomUUID(),
          sessionId,
          report.summary,
          JSON.stringify(report.stats),
          shareToken,
          now,
          now,
          now,
        ],
      )
      .pipe(Effect.orDie);
    yield* store.set("state", "completed");
    const reportUrl = `${env.FRONTEND_BASE_URL}/report/${sessionId}?shareToken=${shareToken}`;
    const email = yield* store.get("email");
    yield* deliverCompletion({
      db,
      senders: {
        telegram: (chatId, text) =>
          sendMessage(env.TELEGRAM_BOT_TOKEN, Number(chatId), text).pipe(
            Effect.mapError(
              (cause) =>
                new DeliveryError({
                  channel: "telegram",
                  reason: cause.reason,
                }),
            ),
          ),
        slack: (team, channel, text) =>
          Effect.gen(function* () {
            const connection = yield* db
              .first(
                "SELECT access_token AS token FROM connections WHERE provider = 'slack' AND external_id = ?",
                [team],
              )
              .pipe(Effect.orDie);
            if (connection === null) {
              return yield* Effect.fail(
                new DeliveryError({
                  channel: "slack",
                  reason: "no_connection",
                }),
              );
            }
            yield* postMessage(String(connection.token), channel, text);
          }).pipe(
            Effect.mapError(
              (cause) =>
                new DeliveryError({
                  channel: "slack",
                  reason: String(cause),
                }),
            ),
          ),
        email: (address, url) => {
          if (
            env.BREVO_API_KEY.length === 0 ||
            env.BREVO_SENDER_EMAIL.length === 0
          ) {
            return Effect.fail(
              new DeliveryError({
                channel: "email",
                reason: "not_configured",
              }),
            );
          }
          return sendEmail({
            apiKey: env.BREVO_API_KEY,
            senderEmail: env.BREVO_SENDER_EMAIL,
            senderName: "Klawva",
            toEmail: address,
            subject: "Your Klawva worker shift has ended",
            html: reportEmailHtml(url),
          }).pipe(
            Effect.mapError(
              (cause) =>
                new DeliveryError({
                  channel: "email",
                  reason: cause.reason,
                }),
            ),
          );
        },
      },
      sessionId,
      reportUrl,
      email,
    });
  });

const StateResponse = Schema.Struct({ state: Schema.String });

const getState = HttpApiEndpoint.get("state", "/state", { success: StateResponse });

const Brief = Schema.Record(Schema.String, Schema.String);

const init = HttpApiEndpoint.post("init", "/init", {
  payload: Schema.Struct({
    state: Schema.String,
    budgetMinor: Schema.Number,
    soul: Schema.String,
    brief: Brief,
    email: Schema.optionalKey(Schema.String),
    allowlist: Schema.optionalKey(Schema.Array(Schema.String)),
    model: Schema.optionalKey(Schema.String),
  }),
  success: StateResponse,
});

const activate = HttpApiEndpoint.post("activate", "/activate", {
  payload: Schema.Struct({ windowEnd: Schema.String }),
  success: StateResponse,
  error: IllegalTransition,
});

const complete = HttpApiEndpoint.post("complete", "/complete", {
  success: StateResponse,
  error: IllegalTransition,
});

const history = HttpApiEndpoint.get("history", "/history", {
  success: Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.String })),
});

const report = HttpApiEndpoint.post("report", "/report", {
  success: Schema.Struct({ ok: Schema.Boolean }),
});

const appendMessage = HttpApiEndpoint.post("appendMessage", "/messages", {
  payload: Schema.Struct({
    role: Schema.Literals(["user", "assistant"]),
    content: Schema.String,
  }),
  success: Schema.Struct({
    ok: Schema.Boolean,
    reply: Schema.optionalKey(Schema.String),
  }),
});

class SessionGroup extends HttpApiGroup.make("Session")
  .add(getState)
  .add(init)
  .add(activate)
  .add(complete)
  .add(history)
  .add(report)
  .add(appendMessage) {}

class SessionApi extends HttpApi.make("SessionApi").add(SessionGroup) {}

const currentState = (store: SessionStoreImpl): Effect.Effect<SessionState> =>
  Effect.gen(function* () {
    const raw = yield* store.get("state");
    return raw === null ? "pending" : Schema.decodeUnknownSync(SessionState)(raw);
  });

const sessionGroup = HttpApiBuilder.group(
  SessionApi,
  "Session",
  Effect.fn(function* (handlers) {
    const store = yield* SessionStore;
    const sessionEnv = yield* SessionEnv;
    return handlers
      .handle("state", () =>
        Effect.gen(function* () {
          const raw = yield* store.get("state");
          return { state: raw ?? "pending" };
        }),
      )
      .handle("init", ({ payload }) =>
        Effect.gen(function* () {
          yield* store.set("state", payload.state);
          yield* store.set("budget_minor", String(payload.budgetMinor));
          yield* store.set("spent_minor", "0");
          yield* store.set("soul", payload.soul);
          yield* store.set("brief", JSON.stringify(payload.brief));
          yield* store.set("email", payload.email ?? "");
          yield* store.set(
            "tool_allowlist",
            JSON.stringify(payload.allowlist ?? defaultToolAllowlist),
          );
          yield* store.set("model", payload.model ?? defaultModel);
          return { state: payload.state };
        }),
      )
      .handle("activate", ({ payload }) =>
        Effect.gen(function* () {
          let from = yield* currentState(store);
          if (from === "pending") {
            from = yield* transition(from, "provisioning");
            yield* store.set("state", from);
          }
          const next = yield* transition(from, "active");
          yield* store.set("state", next);
          yield* store.set("window_end", payload.windowEnd);
          return { state: next };
        }),
      )
      .handle("complete", () =>
        Effect.gen(function* () {
          const next = yield* transition(yield* currentState(store), "completed");
          yield* store.set("state", next);
          return { state: next };
        }),
      )
      .handle("history", () =>
        Effect.gen(function* () {
          return [...(yield* store.history())];
        }),
      )
      .handle("report", () =>
        Effect.gen(function* () {
          yield* completeShift(store, sessionEnv.env, sessionEnv.sessionId);
          return { ok: true };
        }),
      )
      .handle("appendMessage", ({ payload }) =>
        Effect.gen(function* () {
          const db = makeDatabase(sessionEnv.env.DB);
          const mirror = (role: string, content: string) =>
            mirrorMessage(db, sessionEnv.sessionId, role, content);
          yield* store.append(payload.role, payload.content);
          yield* mirror(payload.role, payload.content);
          if (payload.role !== "user") {
            return { ok: true };
          }
          const admission = yield* admitTurn(
            store,
            db,
            sessionEnv.sessionId,
            payload.content,
          ).pipe(
            Effect.catch(() =>
              Effect.succeed({ _tag: "OutOfBudget" } as const),
            ),
          );
          if (admission._tag === "Rejected") {
            yield* persistReply(store, db, sessionEnv.sessionId, admission.reply);
            return { ok: true, reply: admission.reply };
          }
          if (admission._tag === "AtCapacity") {
            yield* persistReply(store, db, sessionEnv.sessionId, capacityReply);
            return { ok: true, reply: capacityReply };
          }
          if (admission._tag === "OutOfBudget") {
            yield* persistReply(store, db, sessionEnv.sessionId, budgetReply);
            return { ok: true, reply: budgetReply };
          }
          const sessionRuntime = makeRuntime(
            sessionEnv.env.AI,
            admission.config.model,
            admission.config.allowlist,
          );
          const history = yield* store.history();
          const inChars =
            admission.config.soul.length +
            JSON.stringify(admission.config.brief).length +
            history.reduce((n, m) => n + m.content.length, 0);
          const reply = yield* runTurn({
            runtime: sessionRuntime,
            soul: admission.config.soul,
            brief: admission.config.brief,
            history,
            sessionId: sessionEnv.sessionId,
            allowlist: admission.config.allowlist,
          }).pipe(
            Effect.flatMap((turn) =>
              Effect.forEach(turn.steps, (step) =>
                recordAiUsage(db, {
                  model: admission.config.model,
                  inTokens: step.inTokens,
                  outTokens: step.outTokens,
                  ok: true,
                }),
              ).pipe(Effect.as(turn.text)),
            ),
            Effect.catch(() =>
              recordAiUsage(db, {
                model: admission.config.model,
                inTokens: charsToTokens(inChars),
                outTokens: 0,
                ok: false,
              }).pipe(
                Effect.andThen(() =>
                  Effect.succeed(
                    "I could not reach my model just now. Please try again.",
                  ),
                ),
              ),
            ),
          );
          yield* store.append("assistant", reply);
          yield* mirror("assistant", reply);
          return { ok: true, reply };
        }).pipe(Effect.orDie),
      );
  }),
);

export const makeLayer = (
  store: SessionStoreImpl,
  env: Env,
  sessionId: string,
) =>
  HttpApiBuilder.layer(SessionApi).pipe(
    Layer.provide(
      sessionGroup.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(SessionStore)(store),
            Layer.succeed(SessionEnv)({ env, sessionId }),
          ),
        ),
      ),
    ),
    Layer.provide(HttpServer.layerServices),
  );

export const serveRestApi = async (
  request: Request,
  store: SessionStoreImpl,
  env: Env,
  sessionId: string,
): Promise<Response> => {
  const layer = makeLayer(store, env, sessionId);
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const handler = yield* HttpRouter.toHttpEffect(layer);
      return yield* handler.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(request),
        ),
      );
    }).pipe(Effect.scoped),
  );
  if (exit._tag === "Success") {
    return HttpServerResponse.toWeb(exit.value);
  }
  const [response] = await Effect.runPromise(
    HttpServerError.causeResponse(exit.cause),
  );
  return HttpServerResponse.toWeb(response);
};

