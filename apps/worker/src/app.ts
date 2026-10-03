import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpServer } from "effect/http";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import { Database, layer as databaseLayer } from "./db/database.ts";
import { Channel } from "./db/schema.ts";
import { soulFor } from "./agent/souls.ts";
import {
  handleUpdate,
  secretHeader,
  TelegramUpdate,
} from "./channels/telegram.ts";
import {
  AgentRuntime,
  defaultModel,
  layer as agentLayer,
} from "./agent/runtime.ts";
import { seedListings } from "./listings/listings.ts";
import {
  createDraft,
  reviewListing,
  submitListing,
} from "./listings/publish.ts";
import { runEval } from "./eval/eval.ts";
import { ReportNotFound } from "./report/report.ts";
import { initializePayment } from "./payments/paystack.ts";
import { generateAddress } from "./payments/breet.ts";
import {
  identityFromToken,
  requestMagicLink,
  tokenFromHeaders,
  verifyMagicLink,
} from "./auth/auth.ts";
import { AuthError } from "./auth/tokens.ts";
import { StudioApi, studioGroup } from "./studio/api.ts";
import { AdminApi, adminGroup } from "./admin/api.ts";

const ReportStats = Schema.Array(
  Schema.Struct({ label: Schema.String, value: Schema.String }),
);

const SharedReport = Schema.Struct({
  summary: Schema.String,
  stats: ReportStats,
  shareToken: Schema.String,
});

const ReportRow = Schema.Struct({
  summary: Schema.String,
  stats: Schema.fromJsonString(ReportStats),
  shareToken: Schema.String,
});

const ListingRow = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  tagline: Schema.String,
  category: Schema.String,
  priceMinor: Schema.Number,
  version: Schema.Number,
  score: Schema.NullOr(Schema.Number),
});
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

const telegramWebhook = HttpApiEndpoint.post(
  "telegramWebhook",
  "/webhooks/telegram",
  {
    payload: TelegramUpdate,
    success: Schema.Struct({ ok: Schema.Boolean }),
  },
);

const seedListingsEndpoint = HttpApiEndpoint.post(
  "seedListings",
  "/api/listings/seed",
  { success: Schema.Struct({ seeded: Schema.Number }) },
);

const listListingsEndpoint = HttpApiEndpoint.get(
  "listListings",
  "/api/listings",
  { success: Schema.Array(ListingRow) },
);

const runEvalEndpoint = HttpApiEndpoint.post("runEval", "/api/eval/run", {
  payload: Schema.Struct({ agentId: Schema.String, task: Schema.String }),
  success: Schema.Struct({ score: Schema.Number, band: Schema.String }),
});

const initializePaymentEndpoint = HttpApiEndpoint.post(
  "initializePayment",
  "/api/payments/initialize",
  {
    payload: Schema.Struct({
      sessionId: Schema.String,
      amountMinor: Schema.Number,
      email: Schema.String,
    }),
    success: Schema.Struct({
      reference: Schema.String,
      checkoutUrl: Schema.String,
    }),
  },
);

const sharedReportEndpoint = HttpApiEndpoint.get(
  "sharedReport",
  "/api/reports/shared/:sessionId",
  {
    params: Schema.Struct({ sessionId: Schema.String }),
    query: Schema.Struct({ shareToken: Schema.String }),
    success: SharedReport,
    error: ReportNotFound,
  },
);

const CreateListing = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  tagline: Schema.String,
  category: Schema.String,
  agentId: Schema.String,
  priceMinor: Schema.Number,
  briefFields: Schema.Array(Schema.String),
});

const createListingEndpoint = HttpApiEndpoint.post(
  "createListing",
  "/api/listings",
  { payload: CreateListing, success: Schema.Struct({ id: Schema.String }) },
);

const submitListingEndpoint = HttpApiEndpoint.post(
  "submitListing",
  "/api/listings/:id/submit",
  {
    params: Schema.Struct({ id: Schema.String }),
    success: Schema.Struct({
      score: Schema.Number,
      band: Schema.String,
      status: Schema.String,
    }),
  },
);

const reviewListingEndpoint = HttpApiEndpoint.post(
  "reviewListing",
  "/api/listings/:id/review",
  {
    params: Schema.Struct({ id: Schema.String }),
    payload: Schema.Struct({ approve: Schema.Boolean }),
    success: Schema.Struct({ ok: Schema.Boolean }),
  },
);

const listReviewsEndpoint = HttpApiEndpoint.get("listReviews", "/api/reviews", {
  success: Schema.Array(ListingRow),
});

const breetAddressEndpoint = HttpApiEndpoint.post(
  "breetAddress",
  "/api/breet/address",
  {
    payload: Schema.Struct({ sessionId: Schema.String, asset: Schema.String }),
    success: Schema.Struct({ address: Schema.String }),
  },
);

const requestLinkEndpoint = HttpApiEndpoint.post(
  "requestLink",
  "/api/auth/request-link",
  {
    payload: Schema.Struct({ email: Schema.String }),
    success: Schema.Struct({ ok: Schema.Boolean }),
  },
);

const verifyLinkEndpoint = HttpApiEndpoint.post("verifyLink", "/api/auth/verify", {
  payload: Schema.Struct({ token: Schema.String }),
  success: Schema.Struct({
    sessionToken: Schema.String,
    email: Schema.String,
    admin: Schema.Boolean,
  }),
  error: AuthError,
});

const meEndpoint = HttpApiEndpoint.get("me", "/api/auth/me", {
  success: Schema.Struct({ email: Schema.String, admin: Schema.Boolean }),
  error: AuthError,
});

class RootGroup extends HttpApiGroup.make("Root")
  .add(health)
  .add(requestLinkEndpoint)
  .add(verifyLinkEndpoint)
  .add(meEndpoint)
  .add(createSession)
  .add(telegramWebhook)
  .add(seedListingsEndpoint)
  .add(listListingsEndpoint)
  .add(runEvalEndpoint)
  .add(initializePaymentEndpoint)
  .add(sharedReportEndpoint)
  .add(createListingEndpoint)
  .add(submitListingEndpoint)
  .add(reviewListingEndpoint)
  .add(listReviewsEndpoint)
  .add(breetAddressEndpoint) {}

class KlawvaApi extends HttpApi.make("Klawva").add(RootGroup) {}

const defaultBudgetMinor = 1500;

const rootGroup = HttpApiBuilder.group(
  KlawvaApi,
  "Root",
  Effect.fn(function* (handlers) {
    const db = yield* Database;
    const env = yield* WorkerEnv;
    const runtime = yield* AgentRuntime;
    return handlers
      .handle("health", () => Effect.succeed({ ok: true, service: "klawva" }))
      .handle("requestLink", ({ payload }) =>
        Effect.gen(function* () {
          yield* requestMagicLink(env, db, payload.email).pipe(Effect.orDie);
          return { ok: true };
        }),
      )
      .handle("verifyLink", ({ payload }) =>
        Effect.gen(function* () {
          const result = yield* verifyMagicLink(env, db, payload.token);
          return {
            sessionToken: result.sessionToken,
            email: result.identity.email,
            admin: result.identity.admin,
          };
        }),
      )
      .handle("me", () =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const token = tokenFromHeaders(request.headers);
          if (token === null) {
            return yield* Effect.fail(new AuthError({ reason: "missing_token" }));
          }
          const identity = yield* identityFromToken(env, db, token);
          return { email: identity.email, admin: identity.admin };
        }),
      )
      .handle("breetAddress", ({ payload }) =>
        Effect.gen(function* () {
          const address = yield* generateAddress(
            env,
            db,
            payload.sessionId,
            payload.asset,
          ).pipe(Effect.orDie);
          return { address };
        }),
      )
      .handle("createListing", ({ payload }) =>
        Effect.gen(function* () {
          const id = yield* createDraft(db, {
            ownerId: "system",
            slug: payload.slug,
            name: payload.name,
            tagline: payload.tagline,
            category: payload.category,
            agentId: payload.agentId,
            priceMinor: payload.priceMinor,
            briefFields: payload.briefFields,
          });
          return { id };
        }),
      )
      .handle("submitListing", ({ params }) =>
        Effect.gen(function* () {
          const result = yield* submitListing(db, runtime, params.id);
          if (result === null) {
            return { score: 0, band: "reject", status: "draft" };
          }
          return result;
        }),
      )
      .handle("reviewListing", ({ params, payload }) =>
        Effect.gen(function* () {
          yield* reviewListing(db, params.id, payload.approve);
          return { ok: true };
        }),
      )
      .handle("listReviews", () =>
        Effect.gen(function* () {
          const rows = yield* db
            .all(
              "SELECT l.id AS id, l.slug AS slug, l.name AS name, l.tagline AS tagline, l.category AS category, l.price_minor AS priceMinor, l.current_version AS version, v.score AS score FROM agent_listings l LEFT JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.status = 'in_review' ORDER BY l.updated_at DESC",
            )
            .pipe(Effect.orDie);
          return rows.map((row) => Schema.decodeUnknownSync(ListingRow)(row));
        }),
      )
      .handle("sharedReport", ({ params, query }) =>
        Effect.gen(function* () {
          const row = yield* db
            .first(
              "SELECT summary AS summary, stats AS stats, share_token AS shareToken FROM mission_reports WHERE session_id = ? AND share_token = ?",
              [params.sessionId, query.shareToken],
            )
            .pipe(Effect.orDie);
          if (row === null) {
            return yield* Effect.fail(
              new ReportNotFound({ sessionId: params.sessionId }),
            );
          }
          return Schema.decodeUnknownSync(ReportRow)(row);
        }),
      )
      .handle("initializePayment", ({ payload }) =>
        Effect.gen(function* () {
          const result = yield* initializePayment({
            secret: env.PAYSTACK_SECRET_KEY,
            sessionId: payload.sessionId,
            amountMinor: payload.amountMinor,
            callbackUrl: `https://klawva.xyz/session/${payload.sessionId}`,
            email: payload.email,
          }).pipe(Effect.orDie);
          const now = new Date().toISOString();
          yield* db
            .run(
              "INSERT INTO payments (id, session_id, provider, provider_reference, amount_minor, currency, status, confirmed_at, created_at, updated_at) VALUES (?, ?, 'paystack', ?, ?, 'NGN', 'pending', NULL, ?, ?)",
              [
                crypto.randomUUID(),
                payload.sessionId,
                result.reference,
                payload.amountMinor,
                now,
                now,
              ],
            )
            .pipe(Effect.orDie);
          return {
            reference: result.reference,
            checkoutUrl: result.checkoutUrl,
          };
        }),
      )
      .handle("seedListings", () =>
        Effect.gen(function* () {
          const seeded = yield* seedListings(db).pipe(Effect.orDie);
          return { seeded };
        }),
      )
      .handle("listListings", () =>
        Effect.gen(function* () {
          const rows = yield* db
            .all(
              "SELECT l.id AS id, l.slug AS slug, l.name AS name, l.tagline AS tagline, l.category AS category, l.price_minor AS priceMinor, l.current_version AS version, v.score AS score FROM agent_listings l LEFT JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.status = 'published' ORDER BY l.slug",
            )
            .pipe(Effect.orDie);
          return rows.map((row) => Schema.decodeUnknownSync(ListingRow)(row));
        }),
      )
      .handle("runEval", ({ payload }) =>
        Effect.gen(function* () {
          const result = yield* runEval({
            runtime,
            soul: soulFor(payload.agentId),
            brief: { task: payload.task },
            cases: [payload.task],
          }).pipe(Effect.orDie);
          return { score: result.score, band: result.band };
        }),
      )
      .handle("telegramWebhook", ({ payload }) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const provided = request.headers[secretHeader];
          if (
            env.TELEGRAM_WEBHOOK_SECRET.length === 0 ||
            provided !== env.TELEGRAM_WEBHOOK_SECRET
          ) {
            return { ok: false };
          }
          yield* handleUpdate(env, db, payload).pipe(
            Effect.catch(() => Effect.void),
          );
          return { ok: true };
        }),
      )
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
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    state: "pending",
                    budgetMinor: defaultBudgetMinor,
                    soul: soulFor(payload.agentId),
                    brief: payload.brief,
                    email: payload.customerEmail ?? "",
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
    agentLayer(env.AI, defaultModel),
  );
  const mainRoutes = HttpApiBuilder.layer(KlawvaApi).pipe(
    Layer.provide(rootGroup.pipe(Layer.provide(services))),
  );
  const studioRoutes = HttpApiBuilder.layer(StudioApi).pipe(
    Layer.provide(studioGroup.pipe(Layer.provide(services))),
  );
  const adminRoutes = HttpApiBuilder.layer(AdminApi).pipe(
    Layer.provide(adminGroup.pipe(Layer.provide(services))),
  );
  return Layer.mergeAll(mainRoutes, studioRoutes, adminRoutes).pipe(
    Layer.provide(HttpServer.layerServices),
  );
};
