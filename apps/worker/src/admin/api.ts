import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import { identityFromToken, tokenFromHeaders } from "../auth/auth.ts";
import { AuthError } from "../auth/tokens.ts";
import { Database } from "../db/database.ts";
import { WorkerEnv } from "../env.ts";
import { Forbidden, ListingConflict, ListingNotFound } from "../errors.ts";
import { approveListing, auditLog, overview, rejectListing, reviewQueue, seed, unpublishListing } from "./admin.ts";

const IdParam = Schema.Struct({ id: Schema.String });

const OverviewResponse = Schema.Struct({
  users: Schema.Number,
  authors: Schema.Number,
  sessions: Schema.Number,
  pendingReviews: Schema.Number,
  listingsByStatus: Schema.Array(
    Schema.Struct({ status: Schema.String, count: Schema.Number }),
  ),
});

const ReviewItem = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  priceMinor: Schema.Number,
  ownerId: Schema.String,
  ownerEmail: Schema.NullOr(Schema.String),
  score: Schema.NullOr(Schema.Number),
  soul: Schema.NullOr(Schema.String),
});

const AuditItem = Schema.Struct({
  id: Schema.String,
  actorEmail: Schema.String,
  action: Schema.String,
  targetId: Schema.String,
  detail: Schema.String,
  createdAt: Schema.String,
});

const allErrors = [AuthError, Forbidden, ListingNotFound, ListingConflict];

const adminOverview = HttpApiEndpoint.get("adminOverview", "/api/admin/overview", {
  success: OverviewResponse,
  error: allErrors,
});

const adminReviews = HttpApiEndpoint.get("adminReviews", "/api/admin/reviews", {
  success: Schema.Array(ReviewItem),
  error: allErrors,
});

const adminApprove = HttpApiEndpoint.post(
  "adminApprove",
  "/api/admin/listings/:id/approve",
  {
    params: IdParam,
    success: Schema.Struct({ status: Schema.String }),
    error: allErrors,
  },
);

const adminReject = HttpApiEndpoint.post(
  "adminReject",
  "/api/admin/listings/:id/reject",
  {
    params: IdParam,
    payload: Schema.Struct({ reason: Schema.String }),
    success: Schema.Struct({ status: Schema.String }),
    error: allErrors,
  },
);

const adminAudit = HttpApiEndpoint.get("adminAudit", "/api/admin/audit", {
  success: Schema.Array(AuditItem),
  error: allErrors,
});

const adminSeed = HttpApiEndpoint.post("adminSeed", "/api/admin/seed", {
  success: Schema.Struct({ seeded: Schema.Number }),
  error: allErrors,
});

const adminUnpublish = HttpApiEndpoint.post(
  "adminUnpublish",
  "/api/admin/listings/:id/unpublish",
  {
    params: IdParam,
    success: Schema.Struct({ status: Schema.String }),
    error: allErrors,
  },
);

class AdminGroup extends HttpApiGroup.make("Admin")
  .add(adminOverview)
  .add(adminReviews)
  .add(adminApprove)
  .add(adminReject)
  .add(adminAudit)
  .add(adminSeed)
  .add(adminUnpublish) {}

export class AdminApi extends HttpApi.make("AdminApi").add(AdminGroup) {}

export const adminGroup = HttpApiBuilder.group(
  AdminApi,
  "Admin",
  Effect.fn(function* (handlers) {
    const db = yield* Database;
    const env = yield* WorkerEnv;

    const requireAdmin = () =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = tokenFromHeaders(request.headers);
        if (token === null) {
          return yield* Effect.fail(new AuthError({ reason: "missing_token" }));
        }
        const identity = yield* identityFromToken(env, db, token);
        if (!identity.admin) {
          return yield* Effect.fail(new Forbidden({}));
        }
        return identity;
      });

    return handlers
      .handle("adminOverview", () =>
        Effect.gen(function* () {
          yield* requireAdmin();
          return yield* overview(db);
        }),
      )
      .handle("adminReviews", () =>
        Effect.gen(function* () {
          yield* requireAdmin();
          const rows = yield* reviewQueue(db);
          return rows.map((row) => Schema.decodeUnknownSync(ReviewItem)(row));
        }),
      )
      .handle("adminApprove", ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* requireAdmin();
          return yield* approveListing(db, env, identity.email, params.id);
        }),
      )
      .handle("adminReject", ({ params, payload }) =>
        Effect.gen(function* () {
          const identity = yield* requireAdmin();
          return yield* rejectListing(db, env, identity.email, params.id, payload.reason);
        }),
      )
      .handle("adminAudit", () =>
        Effect.gen(function* () {
          yield* requireAdmin();
          const rows = yield* auditLog(db);
          return rows.map((row) => Schema.decodeUnknownSync(AuditItem)(row));
        }),
      )
      .handle("adminSeed", () =>
        Effect.gen(function* () {
          yield* requireAdmin();
          const seeded = yield* seed(db);
          return { seeded };
        }),
      )
      .handle("adminUnpublish", ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* requireAdmin();
          return yield* unpublishListing(db, identity.email, params.id);
        }),
      );
  }),
);
