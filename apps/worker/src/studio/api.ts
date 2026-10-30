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
import { indexListing } from "../search/indexing.ts";
import { publishBundle } from "../desktop/bundles.ts";
import {
  SandboxCapReached,
  createAuthorDraft,
  ensureProfile,
  authorProfile,
  listingDetail,
  listingsFor,
  runAuthorKit,
  sandbox,
  submit,
  ownedListing,
  reviseListing,
  setAuthorName,
  updateAuthorDraft,
} from "./studio.ts";
import {
  authorEarnings,
  authorLimits,
  linkAuthorPayout,
  payoutOverview,
} from "./money.ts";

const IdParam = Schema.Struct({ id: Schema.String });

const KitStep = Schema.Struct({
  step: Schema.String,
  ok: Schema.Boolean,
  detail: Schema.String,
});

const LimitsView = Schema.Struct({
  maxWallClockSeconds: Schema.Number,
  maxEvents: Schema.Number,
  maxEventBytes: Schema.Number,
  maxArtifactBytes: Schema.Number,
  minIdleSeconds: Schema.Number,
});

const DataView = Schema.Struct({
  retentionDays: Schema.Number,
  leavesCountry: Schema.Boolean,
  dpia: Schema.Boolean,
});

const ManifestDetailView = Schema.Struct({
  kind: Schema.String,
  billing: Schema.String,
  transport: Schema.Array(Schema.String),
  hosted: Schema.NullOr(
    Schema.Struct({ cardUrl: Schema.String, mode: Schema.String }),
  ),
  desktop: Schema.NullOr(
    Schema.Struct({
      bundleId: Schema.String,
      entrypoint: Schema.String,
      dataDirs: Schema.Array(Schema.String),
      capabilities: Schema.Struct({
        screen: Schema.optional(Schema.Literals(["read"])),
        input: Schema.Array(Schema.String),
        network: Schema.Array(Schema.String),
        fs: Schema.Array(Schema.String),
      }),
    }),
  ),
  limits: Schema.NullOr(LimitsView),
  data: Schema.NullOr(DataView),
  launchMarkets: Schema.Array(Schema.String),
});

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
  lane: Schema.String,
  manifest: ManifestDetailView,
  kit: Schema.Struct({
    ranAt: Schema.NullOr(Schema.String),
    ok: Schema.Boolean,
    steps: Schema.Array(KitStep),
  }),
  bundle: Schema.Struct({
    version: Schema.NullOr(Schema.String),
    sha256: Schema.NullOr(Schema.String),
  }),
  canSubmit: Schema.Boolean,
  submitBlockedReason: Schema.NullOr(Schema.String),
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
  lane: Schema.optional(Schema.Literals(["authored", "hosted", "desktop"])),
  launchMarkets: Schema.optional(
    Schema.Array(Schema.Literals(["us", "in", "ng"])),
  ),
  hosted: Schema.optional(
    Schema.Struct({
      cardUrl: Schema.String,
      mode: Schema.Literals(["push", "pull"]),
      authType: Schema.optional(Schema.String),
      authHeader: Schema.optional(Schema.String),
    }),
  ),
  desktop: Schema.optional(
    Schema.Struct({
      bundleId: Schema.String,
      entrypoint: Schema.String,
      dataDirs: Schema.Array(Schema.String),
      capabilities: Schema.Struct({
        screen: Schema.optional(Schema.Literals(["read"])),
        input: Schema.optional(Schema.Array(Schema.String)),
        network: Schema.optional(Schema.Array(Schema.String)),
        fs: Schema.optional(Schema.Array(Schema.String)),
      }),
      platforms: Schema.optional(
        Schema.Array(Schema.Literals(["windows", "linux", "mac"])),
      ),
    }),
  ),
  data: Schema.optional(
    Schema.Struct({
      retentionDays: Schema.Number,
      leavesCountry: Schema.Boolean,
      dpia: Schema.Boolean,
    }),
  ),
  limits: Schema.optional(
    Schema.Struct({
      maxWallClockSeconds: Schema.optional(Schema.Number),
      maxEvents: Schema.optional(Schema.Number),
      maxEventBytes: Schema.optional(Schema.Number),
      maxArtifactBytes: Schema.optional(Schema.Number),
      minIdleSeconds: Schema.optional(Schema.Number),
    }),
  ),
});

const allErrors = [
  AuthError,
  ListingNotFound,
  ListingConflict,
  SandboxCapReached,
];

const me = HttpApiEndpoint.get("authorMe", "/api/author/me", {
  success: Schema.Struct({ email: Schema.String, displayName: Schema.String }),
  error: allErrors,
});

const setName = HttpApiEndpoint.patch("authorSetName", "/api/author/profile", {
  payload: Schema.Struct({ displayName: Schema.String }),
  success: Schema.Struct({ displayName: Schema.String }),
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
  lane: Schema.optional(Schema.Literals(["authored", "hosted", "desktop"])),
  launchMarkets: Schema.optional(
    Schema.Array(Schema.Literals(["us", "in", "ng"])),
  ),
  hosted: Schema.optional(
    Schema.Struct({
      cardUrl: Schema.String,
      mode: Schema.Literals(["push", "pull"]),
      authType: Schema.optional(Schema.String),
      authHeader: Schema.optional(Schema.String),
    }),
  ),
  desktop: Schema.optional(
    Schema.Struct({
      bundleId: Schema.String,
      entrypoint: Schema.String,
      dataDirs: Schema.Array(Schema.String),
      capabilities: Schema.Struct({
        screen: Schema.optional(Schema.Literals(["read"])),
        input: Schema.optional(Schema.Array(Schema.String)),
        network: Schema.optional(Schema.Array(Schema.String)),
        fs: Schema.optional(Schema.Array(Schema.String)),
      }),
      platforms: Schema.optional(
        Schema.Array(Schema.Literals(["windows", "linux", "mac"])),
      ),
    }),
  ),
  data: Schema.optional(
    Schema.Struct({
      retentionDays: Schema.Number,
      leavesCountry: Schema.Boolean,
      dpia: Schema.Boolean,
    }),
  ),
  limits: Schema.optional(
    Schema.Struct({
      maxWallClockSeconds: Schema.optional(Schema.Number),
      maxEvents: Schema.optional(Schema.Number),
      maxEventBytes: Schema.optional(Schema.Number),
      maxArtifactBytes: Schema.optional(Schema.Number),
      minIdleSeconds: Schema.optional(Schema.Number),
    }),
  ),
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

const KitResponse = Schema.Struct({
  ok: Schema.Boolean,
  steps: Schema.Array(KitStep),
});

const runKit = HttpApiEndpoint.post(
  "authorKit",
  "/api/author/listings/:id/kit",
  { params: IdParam, success: KitResponse, error: allErrors },
);

const PayoutResponse = Schema.Struct({
  tier: Schema.Number,
  country: Schema.NullOr(Schema.String),
  tin: Schema.NullOr(Schema.String),
  psp: Schema.NullOr(Schema.String),
  subaccount: Schema.NullOr(Schema.String),
  currency: Schema.NullOr(Schema.String),
  status: Schema.NullOr(Schema.String),
});

const getPayout = HttpApiEndpoint.get("authorPayout", "/api/author/payout", {
  success: PayoutResponse,
  error: allErrors,
});

const PayoutInput = Schema.Struct({
  psp: Schema.Literals(["paystack", "flutterwave"]),
  subaccount: Schema.String,
  country: Schema.String,
  currency: Schema.String,
  tin: Schema.String,
  acceptTerms: Schema.Boolean,
});

const linkPayout = HttpApiEndpoint.post(
  "authorLinkPayout",
  "/api/author/payout",
  {
    payload: PayoutInput,
    success: Schema.Struct({ ok: Schema.Boolean }),
    error: allErrors,
  },
);

const EarningInstruction = Schema.Struct({
  period: Schema.String,
  grossMinor: Schema.Number,
  commissionMinor: Schema.Number,
  whtMinor: Schema.Number,
  netMinor: Schema.Number,
  status: Schema.String,
  psp: Schema.String,
  createdAt: Schema.String,
});

const EarningsResponse = Schema.Struct({
  tier: Schema.Number,
  currency: Schema.String,
  pending: Schema.Struct({
    grossMinor: Schema.Number,
    commissionMinor: Schema.Number,
    netMinor: Schema.Number,
  }),
  instructions: Schema.Array(EarningInstruction),
});

const getEarnings = HttpApiEndpoint.get(
  "authorEarnings",
  "/api/author/earnings",
  { success: EarningsResponse, error: allErrors },
);

const LimitsResponse = Schema.Struct({
  tier: Schema.Number,
  cap: Schema.Number,
  used: Schema.Number,
});

const getLimits = HttpApiEndpoint.get("authorLimits", "/api/author/limits", {
  success: LimitsResponse,
  error: allErrors,
});

const publishBundleInput = Schema.Struct({
  bundleId: Schema.String,
  version: Schema.String,
  bytesBase64: Schema.String,
  signature: Schema.String,
  minSupported: Schema.optional(Schema.String),
  capabilities: Schema.Record(Schema.String, Schema.String),
});

const publishBundleOutput = Schema.Struct({
  version: Schema.String,
  sha256: Schema.String,
});

const authorPublishBundle = HttpApiEndpoint.post(
  "authorPublishBundle",
  "/api/author/bundles",
  {
    payload: publishBundleInput,
    success: publishBundleOutput,
    error: allErrors,
  },
);

class StudioGroup extends HttpApiGroup.make("Studio")
  .add(me)
  .add(listListings)
  .add(createListing)
  .add(getListing)
  .add(updateListing)
  .add(runSandbox)
  .add(submitListing)
  .add(runKit)
  .add(getPayout)
  .add(linkPayout)
  .add(getEarnings)
  .add(getLimits)
  .add(authorPublishBundle)
  .add(setName) {}

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
          const profile = yield* authorProfile(db, identity.userId);
          return { email: identity.email, displayName: profile.displayName };
        }),
      )
      .handle("authorSetName", ({ payload }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          return yield* setAuthorName(db, identity.userId, payload.displayName);
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
      .handle("authorPublishBundle", ({ payload }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const profile = yield* db
            .first(
              "SELECT public_key AS publicKey FROM author_profiles WHERE user_id = ?",
              [identity.userId],
            )
            .pipe(Effect.orDie);
          const bytes = Uint8Array.from(atob(payload.bytesBase64), (char) =>
            char.charCodeAt(0),
          );
          const result = yield* publishBundle(db, env, {
            bundleId: payload.bundleId,
            authorId: identity.userId,
            version: payload.version,
            bytes,
            signature: payload.signature,
            capabilities: payload.capabilities,
            minSupported: payload.minSupported,
            authorPublicKey: profile === null ? null : String(profile.publicKey ?? ""),
          }).pipe(
            Effect.catch((cause) =>
              Effect.fail(new ListingConflict({ reason: String(cause) })),
            ),
          );
          return result;
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
          const current = yield* ownedListing(db, identity.userId, params.id);
          if (current === null) {
            return yield* Effect.fail(new ListingNotFound({}));
          }
          if (String(current.status) === "published") {
            yield* reviseListing(db, identity.userId, params.id, payload);
            yield* indexListing(env, db, params.id).pipe(Effect.catch(() => Effect.void));
          } else {
            yield* updateAuthorDraft(db, identity.userId, params.id, payload);
          }
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
      )
      .handle("authorKit", ({ params }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          const result = yield* runAuthorKit(db, identity.userId, params.id);
          return { ok: result.ok, steps: [...result.steps] };
        }),
      )
      .handle("authorPayout", () =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          return yield* payoutOverview(db, identity.userId);
        }),
      )
      .handle("authorLinkPayout", ({ payload }) =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          return yield* linkAuthorPayout(db, identity.userId, payload);
        }),
      )
      .handle("authorEarnings", () =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          return yield* authorEarnings(db, identity.userId);
        }),
      )
      .handle("authorLimits", () =>
        Effect.gen(function* () {
          const identity = yield* requireIdentity();
          return yield* authorLimits(db, identity.userId);
        }),
      );
  }),
);
