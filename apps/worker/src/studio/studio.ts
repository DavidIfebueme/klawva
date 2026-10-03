import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { defaultModel, type AgentRuntimeImpl } from "../agent/runtime.ts";
import { type DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";
import { runEval, type Band } from "../eval/eval.ts";
import { ListingConflict, ListingNotFound } from "../errors.ts";
import { manifestHash } from "../listings/listings.ts";
import { statusForBand } from "../listings/publish.ts";
import type { ListingDefinition } from "../listings/definitions.ts";
import { initializePayment } from "../payments/paystack.ts";
import type { Identity } from "../auth/auth.ts";

export const publishFeeMinor = 2000;
export const sandboxDailyCap = 20;

export { ListingConflict, ListingNotFound };

export class FeeRequired extends Schema.TaggedError<FeeRequired>()(
  "FeeRequired",
  { amountMinor: Schema.Number },
  { httpApiStatus: 402 },
) {}

export class SandboxCapReached extends Schema.TaggedError<SandboxCapReached>()(
  "SandboxCapReached",
  { cap: Schema.Number },
  { httpApiStatus: 429 },
) {}

export const capReached = (runsToday: number, cap: number): boolean =>
  runsToday >= cap;

export const ensureProfile = (
  db: DatabaseImpl,
  identity: Identity,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const existing = yield* db
      .first("SELECT id AS id FROM author_profiles WHERE user_id = ?", [
        identity.userId,
      ])
      .pipe(Effect.orDie);
    if (existing !== null) {
      return;
    }
    const now = new Date().toISOString();
    yield* db
      .run(
        "INSERT INTO author_profiles (id, user_id, display_name, status, fee_paid_at, created_at, updated_at) VALUES (?, ?, ?, 'active', NULL, ?, ?)",
        [crypto.randomUUID(), identity.userId, identity.email, now, now],
      )
      .pipe(Effect.orDie);
  });

export const feePaid = (
  db: DatabaseImpl,
  userId: string,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT id AS id FROM author_fees WHERE user_id = ? AND status = 'confirmed' LIMIT 1",
        [userId],
      )
      .pipe(Effect.orDie);
    return row !== null;
  });

export const listingsFor = (
  db: DatabaseImpl,
  userId: string,
): Effect.Effect<ReadonlyArray<Readonly<Record<string, unknown>>>> =>
  db
    .all(
      "SELECT id AS id, slug AS slug, name AS name, status AS status, price_minor AS priceMinor, current_version AS version, updated_at AS updatedAt FROM agent_listings WHERE owner_id = ? ORDER BY updated_at DESC",
      [userId],
    )
    .pipe(Effect.orDie);

export const ownedListing = (
  db: DatabaseImpl,
  userId: string,
  listingId: string,
): Effect.Effect<Readonly<Record<string, unknown>> | null> =>
  db
    .first(
      "SELECT id AS id, slug AS slug, name AS name, tagline AS tagline, category AS category, status AS status, price_minor AS priceMinor, current_version AS version FROM agent_listings WHERE id = ? AND owner_id = ?",
      [listingId, userId],
    )
    .pipe(Effect.orDie);

export interface DraftInput {
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly category: string;
  readonly priceMinor: number;
  readonly briefFields: ReadonlyArray<string>;
  readonly soul: string;
}

export const createAuthorDraft = (
  db: DatabaseImpl,
  userId: string,
  input: DraftInput,
): Effect.Effect<string, ListingConflict> =>
  Effect.gen(function* () {
    const clash = yield* db
      .first("SELECT id AS id FROM agent_listings WHERE slug = ?", [input.slug])
      .pipe(Effect.orDie);
    if (clash !== null) {
      return yield* Effect.fail(new ListingConflict({ reason: "slug_taken" }));
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    yield* db
      .run(
        "INSERT INTO agent_listings (id, owner_id, slug, name, tagline, category, status, price_minor, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, 1, ?, ?)",
        [
          id,
          userId,
          input.slug,
          input.name,
          input.tagline,
          input.category,
          input.priceMinor,
          now,
          now,
        ],
      )
      .pipe(Effect.orDie);
    const definition: ListingDefinition = {
      slug: input.slug,
      name: input.name,
      tagline: input.tagline,
      category: input.category,
      agentId: `author:${input.slug}`,
      briefFields: input.briefFields,
      priceMinor: input.priceMinor,
    };
    const hash = yield* manifestHash(definition).pipe(Effect.orDie);
    yield* db
      .run(
        "INSERT INTO listing_versions (id, listing_id, version, manifest_hash, soul, brief_fields, tool_allowlist, model, score, reviewed_by, reviewed_at, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)",
        [
          crypto.randomUUID(),
          id,
          hash,
          input.soul,
          JSON.stringify(input.briefFields),
          JSON.stringify(["fetch_url"]),
          defaultModel,
          now,
        ],
      )
      .pipe(Effect.orDie);
    return id;
  });

export const listingDetail = (
  db: DatabaseImpl,
  userId: string,
  listingId: string,
): Effect.Effect<Readonly<Record<string, unknown>> | null> =>
  Effect.gen(function* () {
    const listing = yield* ownedListing(db, userId, listingId);
    if (listing === null) {
      return null;
    }
    const version = yield* db
      .first(
        "SELECT soul AS soul, brief_fields AS briefFields, price_minor AS priceMinor FROM listing_versions v JOIN agent_listings l ON l.id = v.listing_id AND l.current_version = v.version WHERE v.listing_id = ?",
        [listingId],
      )
      .pipe(Effect.orDie);
    if (version === null) {
      return listing;
    }
    return { ...listing, soul: version.soul, briefFields: version.briefFields };
  });

export interface UpdateInput {
  readonly name: string;
  readonly tagline: string;
  readonly category: string;
  readonly priceMinor: number;
  readonly briefFields: ReadonlyArray<string>;
  readonly soul: string;
}

export const updateAuthorDraft = (
  db: DatabaseImpl,
  userId: string,
  listingId: string,
  input: UpdateInput,
): Effect.Effect<void, ListingNotFound | ListingConflict> =>
  Effect.gen(function* () {
    const listing = yield* ownedListing(db, userId, listingId);
    if (listing === null) {
      return yield* Effect.fail(new ListingNotFound({}));
    }
    const status = String(listing.status);
    if (status !== "draft" && status !== "rejected") {
      return yield* Effect.fail(
        new ListingConflict({ reason: `not_editable:${status}` }),
      );
    }
    const slug = String(listing.slug);
    const version = Number(listing.version);
    const now = new Date().toISOString();
    yield* db
      .run(
        "UPDATE agent_listings SET name = ?, tagline = ?, category = ?, price_minor = ?, updated_at = ? WHERE id = ?",
        [input.name, input.tagline, input.category, input.priceMinor, now, listingId],
      )
      .pipe(Effect.orDie);
    const definition: ListingDefinition = {
      slug,
      name: input.name,
      tagline: input.tagline,
      category: input.category,
      agentId: `author:${slug}`,
      briefFields: input.briefFields,
      priceMinor: input.priceMinor,
    };
    const hash = yield* manifestHash(definition).pipe(Effect.orDie);
    yield* db
      .run(
        "UPDATE listing_versions SET soul = ?, brief_fields = ?, manifest_hash = ?, score = NULL WHERE listing_id = ? AND version = ?",
        [input.soul, JSON.stringify(input.briefFields), hash, listingId, version],
      )
      .pipe(Effect.orDie);
  });

export const runsToday = (
  db: DatabaseImpl,
  listingId: string,
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT COUNT(*) AS count FROM eval_runs WHERE listing_id = ? AND created_at >= ?",
        [listingId, new Date(Date.now() - 86_400_000).toISOString()],
      )
      .pipe(Effect.orDie);
    return row === null ? 0 : Number(row.count);
  });

export interface EvalOutcome {
  readonly score: number;
  readonly band: Band;
  readonly results: string;
}

const runListingEval = (
  db: DatabaseImpl,
  runtime: AgentRuntimeImpl,
  listingId: string,
  version: number,
  soul: string,
): Effect.Effect<EvalOutcome> =>
  Effect.gen(function* () {
    const result = yield* runEval({
      runtime,
      soul,
      brief: {
        task: "Describe what you do and how you would approach the employer's task.",
      },
      cases: ["Summarize your role in one sentence.", "List what you can do."],
    }).pipe(Effect.orDie);
    const results = JSON.stringify(result.results);
    yield* db
      .run(
        "INSERT INTO eval_runs (id, listing_id, version, score, band, results, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          crypto.randomUUID(),
          listingId,
          version,
          result.score,
          result.band,
          results,
          new Date().toISOString(),
        ],
      )
      .pipe(Effect.orDie);
    return { score: result.score, band: result.band, results };
  });

const loadVersion = (
  db: DatabaseImpl,
  listingId: string,
): Effect.Effect<{ version: number; soul: string } | null> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT l.current_version AS version, v.soul AS soul FROM agent_listings l JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.id = ?",
        [listingId],
      )
      .pipe(Effect.orDie);
    if (row === null) {
      return null;
    }
    return { version: Number(row.version), soul: String(row.soul) };
  });

export const sandbox = (
  db: DatabaseImpl,
  runtime: AgentRuntimeImpl,
  userId: string,
  listingId: string,
): Effect.Effect<
  EvalOutcome,
  ListingNotFound | SandboxCapReached
> =>
  Effect.gen(function* () {
    const listing = yield* ownedListing(db, userId, listingId);
    if (listing === null) {
      return yield* Effect.fail(new ListingNotFound({}));
    }
    const runs = yield* runsToday(db, listingId);
    if (capReached(runs, sandboxDailyCap)) {
      return yield* Effect.fail(new SandboxCapReached({ cap: sandboxDailyCap }));
    }
    const version = yield* loadVersion(db, listingId);
    if (version === null) {
      return yield* Effect.die("version_not_found");
    }
    return yield* runListingEval(db, runtime, listingId, version.version, version.soul);
  });

export const submit = (
  db: DatabaseImpl,
  runtime: AgentRuntimeImpl,
  userId: string,
  listingId: string,
): Effect.Effect<EvalOutcome & { status: string }, ListingNotFound | ListingConflict | FeeRequired> =>
  Effect.gen(function* () {
    const listing = yield* ownedListing(db, userId, listingId);
    if (listing === null) {
      return yield* Effect.fail(new ListingNotFound({}));
    }
    if (String(listing.status) === "published") {
      return yield* Effect.fail(new ListingConflict({ reason: "already_published" }));
    }
    const paid = yield* feePaid(db, userId);
    if (!paid) {
      return yield* Effect.fail(new FeeRequired({ amountMinor: publishFeeMinor }));
    }
    const version = yield* loadVersion(db, listingId);
    if (version === null) {
      return yield* Effect.die("version_not_found");
    }
    const outcome = yield* runListingEval(
      db,
      runtime,
      listingId,
      version.version,
      version.soul,
    );
    const status = statusForBand(outcome.band);
    const now = new Date().toISOString();
    yield* db
      .run(
        "UPDATE listing_versions SET score = ? WHERE listing_id = ? AND version = ?",
        [outcome.score, listingId, version.version],
      )
      .pipe(Effect.orDie);
    yield* db
      .run("UPDATE agent_listings SET status = ?, updated_at = ? WHERE id = ?", [
        status,
        now,
        listingId,
      ])
      .pipe(Effect.orDie);
    return { ...outcome, status };
  });

export const initializeFee = (
  db: DatabaseImpl,
  env: Env,
  userId: string,
  email: string,
): Effect.Effect<{ reference: string; checkoutUrl: string }> =>
  Effect.gen(function* () {
    const result = yield* initializePayment({
      secret: env.PAYSTACK_SECRET_KEY,
      sessionId: `fee_${userId}`,
      amountMinor: publishFeeMinor,
      callbackUrl: `${env.FRONTEND_BASE_URL}/studio`,
      email,
    }).pipe(Effect.orDie);
    const now = new Date().toISOString();
    yield* db
      .run(
        "INSERT INTO author_fees (id, user_id, provider, provider_reference, amount_minor, currency, status, confirmed_at, created_at, updated_at) VALUES (?, ?, 'paystack', ?, ?, 'NGN', 'pending', NULL, ?, ?)",
        [crypto.randomUUID(), userId, result.reference, publishFeeMinor, now, now],
      )
      .pipe(Effect.orDie);
    return result;
  });
