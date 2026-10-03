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
import { WorkerEnv } from "../env.ts";
import {
  FeeRequired,
  ListingConflict,
  ListingNotFound,
  SandboxCapReached,
  createAuthorDraft,
  ensureProfile,
  feePaid,
  initializeFee,
  listingDetail,
  listingsFor,
  sandbox,
  submit,
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
  soul: Schema.optionalKey(Schema.String),
  briefFields: Schema.optionalKey(Schema.String),
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
  agentId: Schema.String,
  priceMinor: Schema.Number,
  briefFields: Schema.Array(Schema.String),
  soul: Schema.String,
});

const allErrors = [
  AuthError,
  ListingNotFound,
  ListingConflict,
  FeeRequired,
  SandboxCapReached,
];

const me = HttpApiEndpoint.get("authorMe", "/api/author/me", {
  success: Schema.Struct({ email: Schema.String, feePaid: Schema.Boolean }),
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

const fee = HttpApiEndpoint.post("authorFee", "/api/author/fee", {
  success: Schema.Struct({ reference: Schema.String, checkoutUrl: Schema.String }),
  error: allErrors,
});

const earnings = HttpApiEndpoint.get("authorEarnings", "/api/author/earnings", {
  success: Schema.Struct({ creditMinor: Schema.Number }),
  error: allErrors,
});

class StudioGroup extends HttpApiGroup.make("Studio")
  .add(me)
  .add(listListings)
  .add(createListing)
  .add(getListing)
  .add(runSandbox)
  .add(submitListing)
  .add(fee)
  .add(earnings) {}

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
          const paid = yield* feePaid(db, identity.userId);
          return { email: identity.email, feePaid: paid };
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
      )
      .handle("authorFee", () =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const result = yield* initializeFee(db, env, identity.userId, identity.email);
          return result;
        }),
      )
      .handle("authorEarnings", () =>
        Effect.gen(function* () {
          yield* requireIdentity();
          return { creditMinor: 0 };
        }),
      );
  }),
);
