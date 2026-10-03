import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import { AgentRuntime } from "../agent/runtime.ts";
import { identityFromToken, tokenFromHeaders } from "../auth/auth.ts";
import { AuthError } from "../auth/tokens.ts";
import { Database } from "../db/database.ts";
import { ListingConflict, ListingNotFound } from "../errors.ts";
import { WorkerEnv } from "../env.ts";
import {
  SandboxCapReached,
  createAuthorDraft,
  ensureProfile,
  listingDetail,
  listingsFor,
  sandbox,
  submit,
  updateAuthorDraft,
} from "./studio.ts";

const IdParam = Schema.Struct({ id: Schema.String });

const Summary = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  status: Schema.String,
  priceMinor: Schema.Number,
  version: Schema.Number,
});

const Detail = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  tagline: Schema.String,
  category: Schema.String,
  status: Schema.String,
  priceMinor: Schema.Number,
  budgetMinor: Schema.Number,
  version: Schema.Number,
  soul: Schema.String,
  briefFields: Schema.String,
});

const EvalResponse = Schema.Struct({
  score: Schema.Number,
  band: Schema.String,
});

const SubmitResponse = Schema.Struct({
  score: Schema.Number,
  band: Schema.String,
  status: Schema.String,
});

const DraftInput = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  tagline: Schema.String,
  category: Schema.String,
  priceMinor: Schema.Number,
  budgetMinor: Schema.Number,
  briefFields: Schema.Array(Schema.String),
  soul: Schema.String,
});

const allErrors = [
  AuthError,
  ListingNotFound,
  ListingConflict,
  SandboxCapReached,
];

const me = HttpApiEndpoint.get("authorMe", "/api/author/me", {
  success: Schema.Struct({ email: Schema.String }),
  error: allErrors,
});

const listListings = HttpApiEndpoint.get("authorListings", "/api/author/listings", {
  success: Schema.Array(Summary),
  error: allErrors,
});

const createListing = HttpApiEndpoint.post(
  "authorCreateListing",
  "/api/author/listings",
  {
    payload: DraftInput,
    success: Schema.Struct({ id: Schema.String }),
    error: allErrors,
  },
);

const getListing = HttpApiEndpoint.get(
  "authorGetListing",
  "/api/author/listings/:id",
  { params: IdParam, success: Detail, error: allErrors },
);

const UpdateInput = Schema.Struct({
  name: Schema.String,
  tagline: Schema.String,
  category: Schema.String,
  priceMinor: Schema.Number,
  budgetMinor: Schema.Number,
  briefFields: Schema.Array(Schema.String),
  soul: Schema.String,
});

const updateListing = HttpApiEndpoint.patch(
  "authorUpdateListing",
  "/api/author/listings/:id",
  {
    params: IdParam,
    payload: UpdateInput,
    success: Schema.Struct({ ok: Schema.Boolean }),
    error: allErrors,
  },
);

const runSandbox = HttpApiEndpoint.post(
  "authorSandbox",
  "/api/author/listings/:id/sandbox",
  { params: IdParam, success: EvalResponse, error: allErrors },
);

const submitListing = HttpApiEndpoint.post(
  "authorSubmit",
  "/api/author/listings/:id/submit",
  { params: IdParam, success: SubmitResponse, error: allErrors },
);

class StudioGroup extends HttpApiGroup.make("Studio")
  .add(me)
  .add(listListings)
  .add(createListing)
  .add(getListing)
  .add(updateListing)
  .add(runSandbox)
  .add(submitListing) {}

export class StudioApi extends HttpApi.make("StudioApi").add(StudioGroup) {}

export const studioGroup = HttpApiBuilder.group(
  StudioApi,
  "Studio",
  Effect.fn(function* (handlers) {
    const db = yield* Database;
    const env = yield* WorkerEnv;
    const runtime = yield* AgentRuntime;

    const requireIdentity = () =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = tokenFromHeaders(request.headers);
        if (token === null) {
          return yield* Effect.fail(new AuthError({ reason: "missing_token" }));
        }
        const identity = yield* identityFromToken(env, db, token);
        yield* ensureProfile(db, identity);
        return identity;
      });

    return handlers
      .handle("authorMe", () =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          return { email: identity.email };
        }),
      )
      .handle("authorListings", () =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const rows = yield* listingsFor(db, identity.userId);
          return rows.map((row) => Schema.decodeUnknownSync(Summary)(row));
        }),
      )
      .handle("authorCreateListing", ({ payload }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const id = yield* createAuthorDraft(db, identity.userId, payload);
          return { id };
        }),
      )
      .handle("authorGetListing", ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const detail = yield* listingDetail(db, identity.userId, params.id);
          if (detail === null) {
            return yield* Effect.fail(new ListingNotFound({}));
          }
          return Schema.decodeUnknownSync(Detail)(detail);
        }),
      )
      .handle("authorUpdateListing", ({ params, payload }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          yield* updateAuthorDraft(db, identity.userId, params.id, payload);
          return { ok: true };
        }),
      )
      .handle("authorSandbox", ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const outcome = yield* sandbox(db, runtime, identity.userId, params.id);
          return { score: outcome.score, band: outcome.band };
        }),
      )
      .handle("authorSubmit", ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const outcome = yield* submit(db, runtime, identity.userId, params.id);
          return {
            score: outcome.score,
            band: outcome.band,
            status: outcome.status,
          };
        }),
      );
  }),
);
