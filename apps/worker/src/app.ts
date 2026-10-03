import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpServer } from "effect/http";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import { Database, layer as databaseLayer } from "./db/database.ts";
import { Channel } from "./db/schema.ts";
import { WorkerEnv } from "./env.ts";
import type { Env } from "./env.ts";

const HealthResponse = Schema.Struct({
  ok: Schema.Boolean,
  service: Schema.String,
});

const SessionCreated = Schema.Struct({ id: Schema.String });

const CreateSession = Schema.Struct({
  listingId: Schema.String,
  agentId: Schema.String,
  channel: Channel,
  brief: Schema.Record(Schema.String, Schema.String),
  customerEmail: Schema.optionalKey(Schema.String),
});

const health = HttpApiEndpoint.get("health", "/health", {
  success: HealthResponse,
});

const createSession = HttpApiEndpoint.post("createSession", "/api/sessions", {
  payload: CreateSession,
  success: SessionCreated,
});

class RootGroup extends HttpApiGroup.make("Root")
  .add(health)
  .add(createSession) {}

class KlawvaApi extends HttpApi.make("Klawva").add(RootGroup) {}

const defaultBudgetMinor = 1500;

const rootGroup = HttpApiBuilder.group(
  KlawvaApi,
  "Root",
  Effect.fn(function* (handlers) {
    const db = yield* Database;
    const env = yield* WorkerEnv;
    return handlers
      .handle("health", () => Effect.succeed({ ok: true, service: "klawva" }))
      .handle("createSession", ({ payload }) =>
        Effect.gen(function* () {
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          yield* db.run(
            "INSERT INTO sessions (id, listing_id, listing_version, agent_id, channel, brief, state, customer_email, window_start, window_end, budget_minor, spent_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              id,
              payload.listingId,
              1,
              payload.agentId,
              payload.channel,
              JSON.stringify(payload.brief),
              "pending",
              payload.customerEmail ?? null,
              null,
              null,
              defaultBudgetMinor,
              0,
              now,
              now,
            ],
          );
          yield* Effect.tryPromise({
            try: () =>
              env.SESSION.get(env.SESSION.idFromName(id)).fetch(
                "https://session/init",
                {
                  method: "POST",
                  body: JSON.stringify({
                    state: "pending",
                    budgetMinor: defaultBudgetMinor,
                  }),
                },
              ),
            catch: (cause) => new Error(String(cause)),
          }).pipe(Effect.orDie);
          return { id };
        }).pipe(Effect.orDie),
      );
  }),
);

export const makeAppLayer = (env: Env) => {
  const services = Layer.mergeAll(
    databaseLayer(env.DB),
    Layer.succeed(WorkerEnv)(env),
  );
  const handlers = rootGroup.pipe(Layer.provide(services));
  return HttpApiBuilder.layer(KlawvaApi).pipe(
    Layer.provide(handlers),
    Layer.provide(HttpServer.layerServices),
  );
};
