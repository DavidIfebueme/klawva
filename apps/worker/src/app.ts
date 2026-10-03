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
import { defaultModel, layer as agentLayer } from "./agent/runtime.ts";
import { ReportNotFound } from "./report/report.ts";
import { sendEmail } from "./email/brevo.ts";
import { escapeHtml, renderTemplate, welcomeEmail } from "./email/templates.ts";
import { initializePayment } from "./payments/paystack.ts";
import {
  identityFromToken,
  requestMagicLink,
  tokenFromHeaders,
  upsertUser,
  verifyMagicLink,
} from "./auth/auth.ts";
import { AuthError } from "./auth/tokens.ts";
import { StudioApi, studioGroup } from "./studio/api.ts";
import { AdminApi, adminGroup } from "./admin/api.ts";
import { AccountApi, accountGroup } from "./account/api.ts";

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
  budgetMinor: Schema.Number,
  version: Schema.Number,
  ownerId: Schema.String,
  avgRating: Schema.NullOr(Schema.Number),
  score: Schema.NullOr(Schema.Number),
});

const PublicListingDetail = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  tagline: Schema.String,
  category: Schema.String,
  priceMinor: Schema.Number,
  budgetMinor: Schema.Number,
  version: Schema.Number,
  briefFields: Schema.String,
});
import { WorkerEnv } from "./env.ts";
import type { Env } from "./env.ts";
import { ListingConflict, ListingNotFound } from "./errors.ts";
import { rateLimited, verifyTurnstile } from "./lib/guard.ts";
import { screenBrief } from "./moderation/moderation.ts";

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
  error: ListingConflict,
});

const telegramWebhook = HttpApiEndpoint.post(
  "telegramWebhook",
  "/webhooks/telegram",
  {
    payload: TelegramUpdate,
    success: Schema.Struct({ ok: Schema.Boolean }),
  },
);

const listListingsEndpoint = HttpApiEndpoint.get(
  "listListings",
  "/api/listings",
  { success: Schema.Array(ListingRow) },
);

const listingDetailBySlugEndpoint = HttpApiEndpoint.get(
  "listingDetailBySlug",
  "/api/listings/:slug",
  {
    params: Schema.Struct({ slug: Schema.String }),
    success: PublicListingDetail,
    error: ListingNotFound,
  },
);

const configEndpoint = HttpApiEndpoint.get("config", "/api/config", {
  success: Schema.Struct({ telegramBotUsername: Schema.String }),
});

const sessionLaunchEndpoint = HttpApiEndpoint.get(
  "sessionLaunch",
  "/api/sessions/:id/launch",
  {
    params: Schema.Struct({ id: Schema.String }),
    success: Schema.Struct({
      telegramBotUsername: Schema.String,
      code: Schema.String,
    }),
  },
);

const ChatMessage = Schema.Struct({
  role: Schema.String,
  content: Schema.String,
  createdAt: Schema.String,
});

const chatMessagesEndpoint = HttpApiEndpoint.get(
  "chatMessages",
  "/api/sessions/:id/messages",
  {
    params: Schema.Struct({ id: Schema.String }),
    success: Schema.Array(ChatMessage),
  },
);

const chatSendEndpoint = HttpApiEndpoint.post(
  "chatSend",
  "/api/sessions/:id/messages",
  {
    params: Schema.Struct({ id: Schema.String }),
    payload: Schema.Struct({ message: Schema.String }),
    success: Schema.Struct({ reply: Schema.String }),
  },
);

const feedbackEndpoint = HttpApiEndpoint.post(
  "sessionFeedback",
  "/api/sessions/:id/feedback",
  {
    params: Schema.Struct({ id: Schema.String }),
    payload: Schema.Struct({
      rating: Schema.Number,
      report: Schema.optionalKey(Schema.String),
    }),
    success: Schema.Struct({ ok: Schema.Boolean }),
  },
);

const contactEndpoint = HttpApiEndpoint.post("contact", "/api/emails/contact", {
  payload: Schema.Struct({
    name: Schema.String,
    email: Schema.String,
    employeeType: Schema.optionalKey(Schema.String),
    description: Schema.String,
  }),
  success: Schema.Struct({ ok: Schema.Boolean }),
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
  .add(listListingsEndpoint)
  .add(listingDetailBySlugEndpoint)
  .add(configEndpoint)
  .add(sessionLaunchEndpoint)
  .add(chatMessagesEndpoint)
  .add(chatSendEndpoint)
  .add(feedbackEndpoint)
  .add(contactEndpoint)
  .add(initializePaymentEndpoint)
  .add(sharedReportEndpoint) {}

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
      .handle("requestLink", ({ payload }) =>
        Effect.gen(function* () {
          const allowed = yield* rateLimited(env.AUTH_LIMITER, payload.email.toLowerCase());
          const human = yield* verifyTurnstile(env.TURNSTILE_SECRET, undefined);
          if (!allowed || !human) {
            return { ok: true };
          }
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
          const allowed = yield* rateLimited(env.PUBLIC_LIMITER, payload.sessionId);
          if (!allowed) {
            return { reference: "", checkoutUrl: "" };
          }
          const session = yield* db
            .first(
              "SELECT l.price_minor AS priceMinor FROM sessions s JOIN agent_listings l ON l.id = s.listing_id WHERE s.id = ?",
              [payload.sessionId],
            )
            .pipe(Effect.orDie);
          if (session === null) {
            return yield* Effect.die("session_not_found");
          }
          const amountMinor = Number(session.priceMinor);
          const result = yield* initializePayment({
            secret: env.PAYSTACK_SECRET_KEY,
            sessionId: payload.sessionId,
            amountMinor,
            callbackUrl: `${env.FRONTEND_BASE_URL}/employees/launch?session=${payload.sessionId}`,
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
                amountMinor,
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
      .handle("listListings", () =>
        Effect.gen(function* () {
          const rows = yield* db
            .all(
              "SELECT l.id AS id, l.slug AS slug, l.name AS name, l.tagline AS tagline, l.category AS category, l.price_minor AS priceMinor, v.budget_minor AS budgetMinor, l.current_version AS version, l.owner_id AS ownerId, (SELECT AVG(rating) FROM session_feedback f WHERE f.listing_id = l.id) AS avgRating, v.score AS score FROM agent_listings l LEFT JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.status = 'published' ORDER BY avgRating DESC NULLS LAST, l.slug",
            )
            .pipe(Effect.orDie);
          return rows.map((row) => Schema.decodeUnknownSync(ListingRow)(row));
        }),
      )
      .handle("listingDetailBySlug", ({ params }) =>
        Effect.gen(function* () {
          const row = yield* db
            .first(
              "SELECT l.id AS id, l.slug AS slug, l.name AS name, l.tagline AS tagline, l.category AS category, l.price_minor AS priceMinor, v.budget_minor AS budgetMinor, l.current_version AS version, v.brief_fields AS briefFields FROM agent_listings l JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.slug = ? AND l.status = 'published'",
              [params.slug],
            )
            .pipe(Effect.orDie);
          if (row === null) {
            return yield* Effect.fail(new ListingNotFound({}));
          }
          return Schema.decodeUnknownSync(PublicListingDetail)(row);
        }),
      )
      .handle("config", () =>
        Effect.succeed({ telegramBotUsername: env.TELEGRAM_BOT_USERNAME }),
      )
      .handle("sessionLaunch", ({ params }) =>
        Effect.gen(function* () {
          const row = yield* db
            .first(
              "SELECT token AS code FROM claim_tokens WHERE session_id = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
              [params.id],
            )
            .pipe(Effect.orDie);
          let code = row === null ? null : String(row.code);
          if (code === null) {
            code = crypto.randomUUID().replace(/-/g, "");
            const now = new Date().toISOString();
            yield* db
              .run(
                "INSERT INTO claim_tokens (id, token, session_id, email, used_at, expires_at, created_at) VALUES (?, ?, ?, '', NULL, ?, ?)",
                [
                  crypto.randomUUID(),
                  code,
                  params.id,
                  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  now,
                ],
              )
              .pipe(Effect.orDie);
          }
          return { telegramBotUsername: env.TELEGRAM_BOT_USERNAME, code };
        }),
      )
      .handle("chatMessages", ({ params }) =>
        Effect.gen(function* () {
          const rows = yield* db
            .all(
              "SELECT role AS role, content AS content, created_at AS createdAt FROM messages WHERE session_id = ? ORDER BY created_at LIMIT 200",
              [params.id],
            )
            .pipe(Effect.orDie);
          return rows.map((row) => Schema.decodeUnknownSync(ChatMessage)(row));
        }),
      )
      .handle("chatSend", ({ params, payload }) =>
        Effect.gen(function* () {
          const allowed = yield* rateLimited(env.PUBLIC_LIMITER, params.id);
          if (!allowed) {
            return { reply: "Too many messages right now. Please wait a moment." };
          }
          const session = yield* db
            .first("SELECT state AS state FROM sessions WHERE id = ?", [params.id])
            .pipe(Effect.orDie);
          if (session === null) {
            return { reply: "This session does not exist." };
          }
          const reply = yield* Effect.tryPromise({
            try: async () => {
              const response = await env.SESSION.get(
                env.SESSION.idFromName(params.id),
              ).fetch("https://session/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: "user", content: payload.message }),
              });
              const body: unknown = await response.json();
              const decoded = Schema.decodeUnknownOption(
                Schema.Struct({ reply: Schema.optionalKey(Schema.String) }),
              )(body);
              return decoded._tag === "Some" ? decoded.value.reply ?? "" : "";
            },
            catch: (cause) => new Error(String(cause)),
          }).pipe(
            Effect.catch(() =>
              Effect.succeed("The employee is unavailable right now. Please try again shortly."),
            ),
          );
          return { reply };
        }),
      )
      .handle("sessionFeedback", ({ params, payload }) =>
        Effect.gen(function* () {
          const allowed = yield* rateLimited(env.PUBLIC_LIMITER, params.id);
          const rating = Math.round(payload.rating);
          if (!allowed || rating < 1 || rating > 5) {
            return { ok: false };
          }
          const session = yield* db
            .first("SELECT listing_id AS listingId FROM sessions WHERE id = ?", [
              params.id,
            ])
            .pipe(Effect.orDie);
          if (session === null) {
            return { ok: false };
          }
          const now = new Date().toISOString();
          yield* db
            .run(
              "INSERT INTO session_feedback (id, session_id, listing_id, rating, report, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET rating = excluded.rating, report = excluded.report",
              [
                crypto.randomUUID(),
                params.id,
                String(session.listingId),
                rating,
                payload.report ?? null,
                now,
              ],
            )
            .pipe(Effect.orDie);
          if (
            payload.report !== undefined &&
            payload.report.trim().length > 0
          ) {
            const to = env.ADMIN_EMAILS.split(",")[0]?.trim() ?? "";
            if (to.length > 0) {
              yield* sendEmail({
                apiKey: env.BREVO_API_KEY,
                senderEmail: env.BREVO_SENDER_EMAIL,
                senderName: "Klawva",
                toEmail: to,
                subject: "Employee report",
                html: renderTemplate({
                  title: "Employee report",
                  body: `Session: ${params.id}<br/>Rating: ${rating}<br/><br/>${escapeHtml(payload.report)}`,
                }),
              }).pipe(Effect.catch(() => Effect.void));
            }
          }
          return { ok: true };
        }),
      )
      .handle("contact", ({ payload }) =>
        Effect.gen(function* () {
          const allowed = yield* rateLimited(env.PUBLIC_LIMITER, payload.email.toLowerCase());
          if (!allowed) {
            return { ok: false };
          }
          const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email);
          const nameOk =
            payload.name.trim().length >= 1 && payload.name.length <= 120;
          const descriptionOk =
            payload.description.trim().length >= 10 &&
            payload.description.length <= 4000;
          if (!emailOk || !nameOk || !descriptionOk) {
            return { ok: false };
          }
          const to = env.ADMIN_EMAILS.split(",")[0]?.trim() ?? "";
          if (to.length > 0) {
            yield* sendEmail({
              apiKey: env.BREVO_API_KEY,
              senderEmail: env.BREVO_SENDER_EMAIL,
              senderName: "Klawva",
              toEmail: to,
              subject: "Custom employee request",
              html: renderTemplate({
                title: "Custom employee request",
                body: `From: <strong>${escapeHtml(payload.name)}</strong> (${escapeHtml(payload.email)})<br/>Type: ${escapeHtml(payload.employeeType ?? "unspecified")}<br/><br/>${escapeHtml(payload.description)}`,
              }),
            }).pipe(Effect.orDie);
          }
          return { ok: true };
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
          const flagged = screenBrief(payload.brief);
          if (flagged !== null) {
            return yield* Effect.fail(new ListingConflict({ reason: flagged }));
          }
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          const userId =
            payload.customerEmail !== undefined && payload.customerEmail.length > 0
              ? yield* upsertUser(db, payload.customerEmail)
              : null;
          const listing = yield* db
            .first(
              "SELECT l.current_version AS version, l.name AS name, v.budget_minor AS budgetMinor FROM agent_listings l JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.id = ?",
              [payload.listingId],
            )
            .pipe(Effect.orDie);
          const listingVersion = listing === null ? 1 : Number(listing.version);
          const budgetMinor =
            listing === null ? defaultBudgetMinor : Number(listing.budgetMinor);
          yield* db.run(
            "INSERT INTO sessions (id, user_id, listing_id, listing_version, agent_id, channel, brief, state, customer_email, window_start, window_end, budget_minor, spent_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              id,
              userId,
              payload.listingId,
              listingVersion,
              payload.agentId,
              payload.channel,
              JSON.stringify(payload.brief),
              "pending",
              payload.customerEmail ?? null,
              null,
              null,
              budgetMinor,
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
                    budgetMinor,
                    soul: soulFor(payload.agentId),
                    brief: payload.brief,
                    email: payload.customerEmail ?? "",
                  }),
                },
              ),
            catch: (cause) => new Error(String(cause)),
          }).pipe(Effect.orDie);
          yield* db
            .run(
              "INSERT INTO claim_tokens (id, token, session_id, email, used_at, expires_at, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)",
              [
                crypto.randomUUID(),
                crypto.randomUUID().replace(/-/g, ""),
                id,
                payload.customerEmail ?? "",
                new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                now,
              ],
            )
            .pipe(Effect.orDie);
          if (
            userId !== null &&
            payload.customerEmail !== undefined &&
            payload.customerEmail.length > 0
          ) {
            const prior = yield* db
              .first(
                "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND id != ?",
                [userId, id],
              )
              .pipe(Effect.orDie);
            if (prior !== null && Number(prior.n) === 0) {
              const employeeName =
                listing === null ? "Your Klawva employee" : String(listing.name);
              yield* sendEmail({
                apiKey: env.BREVO_API_KEY,
                senderEmail: env.BREVO_SENDER_EMAIL,
                senderName: "Klawva",
                toEmail: payload.customerEmail,
                subject: "Welcome to Klawva",
                html: welcomeEmail(employeeName),
              }).pipe(Effect.catch(() => Effect.void));
            }
          }
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
  const accountRoutes = HttpApiBuilder.layer(AccountApi).pipe(
    Layer.provide(accountGroup.pipe(Layer.provide(services))),
  );
  return Layer.mergeAll(mainRoutes, studioRoutes, adminRoutes, accountRoutes).pipe(
    Layer.provide(HttpServer.layerServices),
  );
};
