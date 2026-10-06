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
import {
  defaultModel,
  defaultToolAllowlist,
  makeRuntime,
  resolveAllowlist,
  runTurn,
} from "../agent/runtime.ts";
import { make as makeDatabase } from "../db/database.ts";
import { screenScope, steerReply } from "../moderation/moderation.ts";
import { fallbackReport, generateReport } from "../report/report.ts";
import { reportEmailHtml, sendEmail } from "../email/brevo.ts";
import { sendMessage } from "../channels/telegram.ts";
import type { Env } from "../env.ts";

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
    const report = yield* generateReport({ runtime, history, brief }).pipe(
      Effect.catch(() => Effect.succeed(fallbackReport(history))),
    );
    const db = makeDatabase(env.DB);
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
    if (email !== null && email.length > 0) {
      yield* sendEmail({
        apiKey: env.BREVO_API_KEY,
        senderEmail: env.BREVO_SENDER_EMAIL,
        senderName: "Klawva",
        toEmail: email,
        subject: "Your Klawva worker shift has ended",
        html: reportEmailHtml(reportUrl),
      }).pipe(Effect.catch(() => Effect.void));
    }
    const link = yield* db
      .first(
        "SELECT chat_id AS chatId FROM channel_links WHERE session_id = ? AND channel = 'telegram' LIMIT 1",
        [sessionId],
      )
      .pipe(Effect.orDie);
    if (link !== null) {
      yield* sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        Number(link.chatId),
        `Your shift is complete. Here is your report: ${reportUrl}`,
      ).pipe(Effect.catch(() => Effect.void));
    }
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
  payload: Schema.Struct({ role: Schema.String, content: Schema.String }),
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
            db
              .run(
                "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                [
                  crypto.randomUUID(),
                  sessionEnv.sessionId,
                  role,
                  content,
                  new Date().toISOString(),
                ],
              )
              .pipe(Effect.orDie);
          yield* store.append(payload.role, payload.content);
          yield* mirror(payload.role, payload.content);
          if (payload.role !== "user") {
            return { ok: true };
          }
          const brief = Schema.decodeUnknownSync(Brief)(
            JSON.parse((yield* store.get("brief")) ?? "{}"),
          );
          const verdict = screenScope(payload.content, brief);
          if (verdict !== "in_scope") {
            const steered = steerReply(verdict);
            yield* store.append("assistant", steered);
            yield* mirror("assistant", steered);
            return { ok: true, reply: steered };
          }
          const day = new Date().toISOString().slice(0, 10);
          const counterKey = `turns:${day}`;
          const counter = yield* db
            .first("SELECT value AS value FROM counters WHERE key = ?", [counterKey])
            .pipe(Effect.orDie);
          const used = counter === null ? 0 : Number(counter.value);
          if (used >= 5000) {
            const capacityReply =
              "Klawva is at capacity for today. Please try again tomorrow.";
            yield* store.append("assistant", capacityReply);
            yield* mirror("assistant", capacityReply);
            return { ok: true, reply: capacityReply };
          }
          yield* db
            .run(
              "INSERT INTO counters (key, value, updated_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET value = value + 1, updated_at = excluded.updated_at",
              [counterKey, new Date().toISOString()],
            )
            .pipe(Effect.orDie);
          yield* store.spend(50);
          const soul = (yield* store.get("soul")) ?? "";
          const allowlist = resolveAllowlist(yield* store.get("tool_allowlist"));
          const model = (yield* store.get("model")) ?? defaultModel;
          const sessionRuntime = makeRuntime(sessionEnv.env.AI, model, allowlist);
          const history = yield* store.history();
          const reply = yield* runTurn({
            runtime: sessionRuntime,
            soul,
            brief,
            history,
            sessionId: sessionEnv.sessionId,
            allowlist,
          }).pipe(
            Effect.catch(() =>
              Effect.succeed("I could not reach my model just now. Please try again."),
            ),
          );
          yield* store.append("assistant", reply);
          yield* mirror("assistant", reply);
          return { ok: true, reply };
        }).pipe(Effect.orDie),
      );
  }),
);

const makeLayer = (
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

export class SessionAgent {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS session_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS session_messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)",
    );
  }

  async fetch(request: Request): Promise<Response> {
    const layer = makeLayer(
      makeStore(this.ctx.storage.sql),
      this.env,
      String(this.ctx.id.name ?? ""),
    );
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
  }

  async alarm(): Promise<void> {
    await Effect.runPromise(
      completeShift(
        makeStore(this.ctx.storage.sql),
        this.env,
        String(this.ctx.id.name ?? ""),
      ),
    );
  }
}
