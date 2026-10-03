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
  AgentRuntime,
  layer as agentLayer,
  runTurn,
} from "../agent/runtime.ts";
import type { Env } from "../env.ts";

export class IllegalTransition extends Schema.TaggedError<IllegalTransition>()(
  "IllegalTransition",
  {
    from: Schema.String,
    to: Schema.String,
  },
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

const StateResponse = Schema.Struct({ state: Schema.String });

const getState = HttpApiEndpoint.get("state", "/state", { success: StateResponse });

const Brief = Schema.Record(Schema.String, Schema.String);

const init = HttpApiEndpoint.post("init", "/init", {
  payload: Schema.Struct({
    state: Schema.String,
    budgetMinor: Schema.Number,
    soul: Schema.String,
    brief: Brief,
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
    const runtime = yield* AgentRuntime;
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
      .handle("appendMessage", ({ payload }) =>
        Effect.gen(function* () {
          yield* store.append(payload.role, payload.content);
          if (payload.role !== "user") {
            return { ok: true };
          }
          yield* store.spend(50);
          const soul = (yield* store.get("soul")) ?? "";
          const brief = Schema.decodeUnknownSync(Brief)(
            JSON.parse((yield* store.get("brief")) ?? "{}"),
          );
          const history = yield* store.history();
          const reply = yield* runTurn({ runtime, soul, brief, history });
          yield* store.append("assistant", reply);
          return { ok: true, reply };
        }).pipe(Effect.orDie),
      );
  }),
);

const model = "@cf/zai-org/glm-4.7-flash";

const makeLayer = (store: SessionStoreImpl, env: Env) =>
  HttpApiBuilder.layer(SessionApi).pipe(
    Layer.provide(
      sessionGroup.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(SessionStore)(store),
            agentLayer(env.AI, model),
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
    const layer = makeLayer(makeStore(this.ctx.storage.sql), this.env);
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
    const store = makeStore(this.ctx.storage.sql);
    await Effect.runPromise(store.set("state", "completed"));
  }
}
