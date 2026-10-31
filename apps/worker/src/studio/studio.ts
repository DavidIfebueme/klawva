import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { defaultModel, defaultToolAllowlist, type AgentRuntimeImpl } from "../agent/runtime.ts";
import { recordAiUsage } from "../agent/meter.ts";
import { type DatabaseImpl } from "../db/database.ts";
import { runEval, type Band } from "../eval/eval.ts";
import { ListingConflict, ListingNotFound } from "../errors.ts";
import { encodeManifest, manifestHash } from "../listings/listings.ts";
import {
  manifestForLane,
  validateManifest,
  type DataDraft,
  type DesktopDraft,
  type HostedDraft,
  type Lane,
  type LimitsDraft,
} from "../listings/manifest.ts";
import { statusForBand } from "../listings/publish.ts";
import { screenSoul } from "../moderation/moderation.ts";
import { hashToken } from "../hosted/tokens.ts";
import type { Identity } from "../auth/auth.ts";
import {
  ManifestJson,
  manifestOf,
  type LaunchMarket,
  type LimitsManifest,
  type Manifest,
} from "../db/schema.ts";
import {
  authorStanding,
  canCreateListing,
  countListings,
  listingCap,
  tierFor,
} from "../marketplace/kyc.ts";
import {
  kitDailyCap,
  kitRunsToday,
  latestKitRun,
  runKitForListing,
  type KitResult,
} from "../hosted/kit.ts";

export const sandboxDailyCap = 20;

export { ListingConflict, ListingNotFound };

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
        [
          crypto.randomUUID(),
          identity.userId,
          identity.email.split("@")[0] ?? "author",
          now,
          now,
        ],
      )
      .pipe(Effect.orDie);
  });

export const authorProfile = (
  db: DatabaseImpl,
  userId: string,
): Effect.Effect<{ displayName: string }> =>
  db
    .first("SELECT display_name AS displayName FROM author_profiles WHERE user_id = ?", [
      userId,
    ])
    .pipe(
      Effect.map((row) =>
        row === null ? { displayName: "" } : { displayName: String(row.displayName ?? "") },
      ),
      Effect.orDie,
    );

export const setAuthorName = (
  db: DatabaseImpl,
  userId: string,
  displayName: string,
): Effect.Effect<{ displayName: string }, ListingConflict> =>
  Effect.gen(function* () {
    const name = displayName.trim();
    if (name.length < 2 || name.length > 80) {
      return yield* Effect.fail(new ListingConflict({ reason: "author_name_invalid" }));
    }
    const now = new Date().toISOString();
    yield* db
      .run(
        "UPDATE author_profiles SET display_name = ?, updated_at = ? WHERE user_id = ?",
        [name, now, userId],
      )
      .pipe(Effect.orDie);
    return { displayName: name };
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
  readonly budgetMinor: number;
  readonly briefFields: ReadonlyArray<string>;
  readonly soul: string;
  readonly lane?: Lane;
  readonly launchMarkets?: ReadonlyArray<LaunchMarket>;
  readonly hosted?: HostedDraft;
  readonly desktop?: DesktopDraft;
  readonly data?: DataDraft;
  readonly limits?: LimitsDraft;
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugProblem = (slug: string): string | null => {
  if (slug.length < 2 || slug.length > 64) {
    return "slug_length";
  }
  return slugPattern.test(slug) ? null : "slug_format";
};

const storedManifest = (
  db: DatabaseImpl,
  listingId: string,
  version: number,
): Effect.Effect<Manifest | null> =>
  db
    .first(
      "SELECT manifest AS manifest FROM listing_versions WHERE listing_id = ? AND version = ?",
      [listingId, version],
    )
    .pipe(
      Effect.map((row) => {
        if (row === null || typeof row.manifest !== "string") {
          return null;
        }
        const decoded = Schema.decodeUnknownOption(ManifestJson)(String(row.manifest));
        return decoded._tag === "Some" ? decoded.value : null;
      }),
      Effect.orDie,
    );

const laneDraft = (
  input: {
    readonly soul: string;
    readonly lane?: Lane;
    readonly launchMarkets?: ReadonlyArray<LaunchMarket>;
    readonly hosted?: HostedDraft;
    readonly desktop?: DesktopDraft;
    readonly data?: DataDraft;
    readonly limits?: LimitsDraft;
  },
  current: Manifest | null,
) => {
  const runtime = current?.runtime;
  const hosted: HostedDraft | undefined =
    input.hosted !== undefined
      ? input.hosted
      : runtime?.hosted === undefined
        ? undefined
        : {
            cardUrl: runtime.hosted.cardUrl,
            mode: runtime.hosted.mode,
            ...(runtime.hosted.auth === undefined
              ? {}
              : {
                  authType: runtime.hosted.auth.type,
                  authHeader: runtime.hosted.auth.header,
                }),
          };
  const desktop: DesktopDraft | undefined =
    input.desktop !== undefined
      ? input.desktop
      : runtime?.desktop === undefined
        ? undefined
        : {
            bundleId: runtime.desktop.bundleId,
            entrypoint: runtime.desktop.entrypoint,
            dataDirs: runtime.desktop.dataDirs,
            platforms: runtime.desktop.platforms,
            capabilities: runtime.desktop.capabilities,
          };
  return {
    soul: input.soul,
    lane: input.lane ?? runtime?.kind ?? "authored",
    launchMarkets: input.launchMarkets ?? current?.launchMarkets,
    hosted,
    desktop,
    data: input.data ?? current?.data,
    limits: input.limits ?? current?.limits,
  };
};

const buildManifest = (
  input: Parameters<typeof laneDraft>[0],
  current: Manifest | null,
): Effect.Effect<Manifest, ListingConflict> => {
  const built = manifestForLane(laneDraft(input, current));
  return built.ok
    ? Effect.succeed(built.manifest)
    : Effect.fail(
        new ListingConflict({ reason: `manifest:${built.reasons.join(",")}` }),
      );
};

const versionHash = (
  manifest: Manifest,
  briefFields: ReadonlyArray<string>,
  budgetMinor: number,
): Effect.Effect<string> =>
  manifestHash({
    manifest,
    briefFields,
    toolAllowlist: defaultToolAllowlist,
    model: defaultModel,
    budgetMinor,
  }).pipe(Effect.orDie);

export const createAuthorDraft = (
  db: DatabaseImpl,
  userId: string,
  input: DraftInput,
): Effect.Effect<string, ListingConflict> =>
  Effect.gen(function* () {
    const standing = (yield* authorStanding(db, userId)) ?? tierFor({});
    const existing = yield* countListings(db, userId);
    const cap = listingCap[standing.tier];
    if (!canCreateListing(standing, existing)) {
      return yield* Effect.fail(
        new ListingConflict({ reason: "listing_cap_reached" }),
      );
    }
    const slugFault = slugProblem(input.slug);
    if (slugFault !== null) {
      return yield* Effect.fail(new ListingConflict({ reason: slugFault }));
    }
    const clash = yield* db
      .first("SELECT id AS id FROM agent_listings WHERE slug = ?", [input.slug])
      .pipe(Effect.orDie);
    if (clash !== null) {
      return yield* Effect.fail(new ListingConflict({ reason: "slug_taken" }));
    }
    const manifest = yield* buildManifest(input, null);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const created = yield* db
      .first(
        "INSERT INTO agent_listings (id, owner_id, slug, name, tagline, category, status, price_minor, current_version, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, 'draft', ?, 1, ?, ? WHERE (SELECT COUNT(*) FROM agent_listings WHERE owner_id = ?) < ? RETURNING id AS id",
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
          userId,
          cap,
        ],
      )
      .pipe(Effect.orDie);
    if (created === null) {
      return yield* Effect.fail(
        new ListingConflict({ reason: "listing_cap_reached" }),
      );
    }
    const hash = yield* versionHash(manifest, input.briefFields, input.budgetMinor);
    yield* db
      .run(
        "INSERT INTO listing_versions (id, listing_id, version, manifest_hash, soul, manifest, brief_fields, tool_allowlist, model, budget_minor, score, reviewed_by, reviewed_at, created_at, manifest_schema_version) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 2)",
        [
          crypto.randomUUID(),
          id,
          hash,
          input.soul,
          encodeManifest(manifest),
          JSON.stringify(input.briefFields),
          JSON.stringify(defaultToolAllowlist),
          defaultModel,
          input.budgetMinor,
          now,
        ],
      )
      .pipe(Effect.orDie);
    return id;
  });

export interface ManifestView {
  readonly kind: string;
  readonly billing: string;
  readonly transport: string[];
  readonly hosted: { readonly cardUrl: string; readonly mode: string } | null;
  readonly desktop: {
    readonly bundleId: string;
    readonly entrypoint: string;
    readonly dataDirs: string[];
    readonly capabilities: {
      readonly screen?: "read";
      readonly input: string[];
      readonly network: string[];
      readonly fs: string[];
    };
  } | null;
  readonly limits: LimitsManifest | null;
  readonly data: {
    readonly retentionDays: number;
    readonly leavesCountry: boolean;
    readonly dpia: boolean;
  } | null;
  readonly launchMarkets: string[];
}

export const manifestView = (manifest: Manifest): ManifestView => {
  const runtime = manifest.runtime;
  const desktop = runtime?.desktop;
  return {
    kind: runtime?.kind ?? "authored",
    billing: runtime?.billing ?? "platform-metered",
    transport: runtime === undefined ? [] : [...runtime.transport],
    hosted:
      runtime?.hosted === undefined
        ? null
        : { cardUrl: runtime.hosted.cardUrl, mode: runtime.hosted.mode },
    desktop:
      desktop === undefined
        ? null
        : {
            bundleId: desktop.bundleId,
            entrypoint: desktop.entrypoint,
            dataDirs: [...desktop.dataDirs],
            capabilities: {
              ...(desktop.capabilities.screen === undefined
                ? {}
                : { screen: desktop.capabilities.screen }),
              input: desktop.capabilities.input === undefined ? [] : [...desktop.capabilities.input],
              network:
                desktop.capabilities.network === undefined
                  ? []
                  : [...desktop.capabilities.network],
              fs: desktop.capabilities.fs === undefined ? [] : [...desktop.capabilities.fs],
            },
          },
    limits: manifest.limits ?? null,
    data:
      manifest.data === undefined
        ? null
        : {
            retentionDays: manifest.data.retentionDays,
            leavesCountry: manifest.data.leavesCountry,
            dpia: manifest.data.dpia,
          },
    launchMarkets: manifest.launchMarkets === undefined ? [] : [...manifest.launchMarkets],
  };
};

interface BundleSummary {
  readonly version: string | null;
  readonly sha256: string | null;
}

const bundleFor = (
  db: DatabaseImpl,
  manifest: Manifest,
): Effect.Effect<BundleSummary> => {
  const bundleId = manifest.runtime?.desktop?.bundleId;
  if (bundleId === undefined) {
    return Effect.succeed({ version: null, sha256: null });
  }
  return db
    .first(
      "SELECT version AS version, sha256 AS sha256 FROM bundle_versions WHERE bundle_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 1",
      [bundleId],
    )
    .pipe(
      Effect.orDie,
      Effect.map((row) =>
        row === null
          ? { version: null, sha256: null }
          : { version: String(row.version), sha256: String(row.sha256) },
      ),
    );
};

export const submitBlockedReason = (
  db: DatabaseImpl,
  listingId: string,
  version: number,
  status: string,
  manifest: Manifest,
): Effect.Effect<string | null> =>
  Effect.gen(function* () {
    if (status !== "draft" && status !== "rejected" && status !== "published") {
      return `not_submittable:${status}`;
    }
    const verdict = validateManifest(manifest);
    if (!verdict.ok) {
      return `manifest:${verdict.reasons.join(",")}`;
    }
    const lane = manifest.runtime?.kind ?? "authored";
    if (lane !== "authored") {
      const owner = yield* db
        .first("SELECT owner_id AS ownerId FROM agent_listings WHERE id = ?", [
          listingId,
        ])
        .pipe(Effect.orDie);
      const profile =
        owner === null
          ? null
          : yield* db
              .first(
                "SELECT display_name AS displayName FROM author_profiles WHERE user_id = ?",
                [String(owner.ownerId)],
              )
              .pipe(Effect.orDie);
      const name = profile === null ? "" : String(profile.displayName ?? "").trim();
      if (name.length === 0) {
        return "author_name_missing";
      }
    }
    if (lane === "hosted") {
      const run = yield* latestKitRun(db, listingId, version);
      const cardUrl = manifest.runtime?.hosted?.cardUrl;
      if (run === null || !run.ok || cardUrl === undefined) {
        return "kit_not_green";
      }
      const cardHash = yield* hashToken(cardUrl).pipe(Effect.orDie);
      if (run.cardHash !== cardHash) {
        return "kit_not_green";
      }
    }
    if (lane === "desktop") {
      const bundleId = manifest.runtime?.desktop?.bundleId;
      if (bundleId === undefined) {
        return "bundle_missing";
      }
      const bundle = yield* db
        .first(
          "SELECT b.id AS id FROM desktop_bundles b JOIN bundle_versions v ON v.bundle_id = b.id AND v.status = 'published' WHERE b.id = ? AND b.author_id = (SELECT owner_id FROM agent_listings WHERE id = ?) LIMIT 1",
          [bundleId, listingId],
        )
        .pipe(Effect.orDie);
      if (bundle === null) {
        return "bundle_missing";
      }
    }
    return null;
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
        "SELECT v.version AS version, v.soul AS soul, v.brief_fields AS briefFields, v.budget_minor AS budgetMinor, v.manifest AS manifest FROM listing_versions v JOIN agent_listings l ON l.id = v.listing_id AND l.current_version = v.version WHERE v.listing_id = ?",
        [listingId],
      )
      .pipe(Effect.orDie);
    if (version === null) {
      return yield* Effect.die("listing_version_missing");
    }
    const manifest = manifestOf({
      soul: String(version.soul ?? ""),
      manifest: typeof version.manifest === "string" ? version.manifest : null,
    });
    const versionNumber = Number(version.version);
    const kit = yield* latestKitRun(db, listingId, versionNumber);
    const bundle = yield* bundleFor(db, manifest);
    const blocked = yield* submitBlockedReason(
      db,
      listingId,
      versionNumber,
      String(listing.status),
      manifest,
    );
    return {
      ...listing,
      soul: version.soul,
      briefFields: version.briefFields,
      budgetMinor: version.budgetMinor,
      lane: manifest.runtime?.kind ?? "authored",
      manifest: manifestView(manifest),
      kit:
        kit === null
          ? { ranAt: null, ok: false, steps: [] }
          : { ranAt: kit.ranAt, ok: kit.ok, steps: kit.steps },
      bundle,
      canSubmit: blocked === null,
      submitBlockedReason: blocked,
    };
  });

export type UpdateInput = Omit<DraftInput, "slug">;

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
    const version = Number(listing.version);
    const now = new Date().toISOString();
    const previous = yield* storedManifest(db, listingId, version);
    const manifest = yield* buildManifest(input, previous);
    yield* db
      .run(
        "UPDATE agent_listings SET name = ?, tagline = ?, category = ?, price_minor = ?, updated_at = ? WHERE id = ?",
        [input.name, input.tagline, input.category, input.priceMinor, now, listingId],
      )
      .pipe(Effect.orDie);
    const hash = yield* versionHash(manifest, input.briefFields, input.budgetMinor);
    yield* db
      .run(
        "UPDATE listing_versions SET soul = ?, manifest = ?, brief_fields = ?, manifest_hash = ?, budget_minor = ?, score = NULL WHERE listing_id = ? AND version = ?",
        [
          input.soul,
          encodeManifest(manifest),
          JSON.stringify(input.briefFields),
          hash,
          input.budgetMinor,
          listingId,
          version,
        ],
      )
      .pipe(Effect.orDie);
  });

export const deleteAuthorListing = (
  db: DatabaseImpl,
  userId: string,
  listingId: string,
): Effect.Effect<void, ListingNotFound | ListingConflict> =>
  Effect.gen(function* () {
    const listing = yield* ownedListing(db, userId, listingId);
    if (listing === null) {
      return yield* Effect.fail(new ListingNotFound({}));
    }
    const status = String(listing.status);
    if (status !== "draft" && status !== "rejected") {
      return yield* Effect.fail(
        new ListingConflict({ reason: `not_deletable:${status}` }),
      );
    }
    yield* db
      .run("DELETE FROM listing_versions WHERE listing_id = ?", [listingId])
      .pipe(Effect.orDie);
    yield* db
      .run("DELETE FROM agent_listings WHERE id = ? AND owner_id = ?", [listingId, userId])
      .pipe(Effect.orDie);
  });

export const withdrawListing = (
  db: DatabaseImpl,
  userId: string,
  listingId: string,
): Effect.Effect<{ status: string }, ListingNotFound | ListingConflict> =>
  Effect.gen(function* () {
    const listing = yield* ownedListing(db, userId, listingId);
    if (listing === null) {
      return yield* Effect.fail(new ListingNotFound({}));
    }
    const status = String(listing.status);
    if (status !== "in_review") {
      return yield* Effect.fail(
        new ListingConflict({ reason: `not_withdrawable:${status}` }),
      );
    }
    const version = Number(listing.version);
    const now = new Date().toISOString();
    yield* db
      .run("UPDATE agent_listings SET status = 'draft', updated_at = ? WHERE id = ?", [
        now,
        listingId,
      ])
      .pipe(Effect.orDie);
    yield* db
      .run(
        "UPDATE listing_versions SET status = 'draft' WHERE listing_id = ? AND version = ?",
        [listingId, version],
      )
      .pipe(Effect.orDie);
    return { status: "draft" };
  });

export const reviseListing = (
  db: DatabaseImpl,
  userId: string,
  listingId: string,
  input: UpdateInput,
): Effect.Effect<{ version: number }, ListingNotFound | ListingConflict> =>
  Effect.gen(function* () {
    const listing = yield* ownedListing(db, userId, listingId);
    if (listing === null) {
      return yield* Effect.fail(new ListingNotFound({}));
    }
    const status = String(listing.status);
    if (status !== "published") {
      return yield* Effect.fail(
        new ListingConflict({ reason: `not_revisable:${status}` }),
      );
    }
    const slug = String(listing.slug);
    const current = Number(listing.version);
    const next = current + 1;
    const now = new Date().toISOString();
    const previous = yield* storedManifest(db, listingId, current);
    const manifest = yield* buildManifest(input, previous);
    const hash = yield* versionHash(manifest, input.briefFields, input.budgetMinor);
    yield* db
      .run(
        "INSERT INTO listing_versions (id, listing_id, version, manifest_hash, soul, manifest, brief_fields, tool_allowlist, model, budget_minor, score, reviewed_by, reviewed_at, created_at, status, manifest_schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 'draft', 2)",
        [
          crypto.randomUUID(),
          listingId,
          next,
          hash,
          input.soul,
          encodeManifest(manifest),
          JSON.stringify(input.briefFields),
          JSON.stringify(defaultToolAllowlist),
          defaultModel,
          input.budgetMinor,
          now,
        ],
      )
      .pipe(Effect.orDie);
    yield* db
      .run(
        "UPDATE agent_listings SET name = ?, tagline = ?, category = ?, price_minor = ?, updated_at = ? WHERE id = ?",
        [input.name, input.tagline, input.category, input.priceMinor, now, listingId],
      )
      .pipe(Effect.orDie);
    return { version: next };
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
    if (row === null) {
      return yield* Effect.die("count_row_missing");
    }
    return Number(row.count);
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
    }).pipe(
      Effect.tap((outcome) =>
        recordAiUsage(db, {
          model: defaultModel,
          inTokens: outcome.usage.inTokens,
          outTokens: outcome.usage.outTokens,
          ok: true,
        }),
      ),
      Effect.tapError(() =>
        recordAiUsage(db, {
          model: defaultModel,
          inTokens: 0,
          outTokens: 0,
          ok: false,
        }),
      ),
      Effect.orDie,
    );
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
): Effect.Effect<{ version: number; soul: string; manifest: Manifest } | null> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT v.version AS version, v.soul AS soul, v.manifest AS manifest FROM agent_listings l JOIN listing_versions v ON v.listing_id = l.id WHERE l.id = ? AND v.version = COALESCE((SELECT MAX(version) FROM listing_versions WHERE listing_id = l.id AND status = 'draft'), l.current_version)",
        [listingId],
      )
      .pipe(Effect.orDie);
    if (row === null) {
      return null;
    }
    const soul = String(row.soul);
    return {
      version: Number(row.version),
      soul,
      manifest: manifestOf({
        soul,
        manifest: typeof row.manifest === "string" ? row.manifest : null,
      }),
    };
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
): Effect.Effect<EvalOutcome & { status: string }, ListingNotFound | ListingConflict> =>
  Effect.gen(function* () {
    const listing = yield* ownedListing(db, userId, listingId);
    if (listing === null) {
      return yield* Effect.fail(new ListingNotFound({}));
    }
    const listingStatus = String(listing.status);
    const revising = listingStatus === "published";
    if (!revising && listingStatus !== "draft" && listingStatus !== "rejected") {
      return yield* Effect.fail(
        new ListingConflict({ reason: `not_submittable:${listingStatus}` }),
      );
    }
    const version = yield* loadVersion(db, listingId);
    if (version === null) {
      return yield* Effect.die("version_not_found");
    }
    const flagged = screenSoul(version.soul);
    if (flagged !== null) {
      return yield* Effect.fail(new ListingConflict({ reason: flagged }));
    }
    const blocked = yield* submitBlockedReason(
      db,
      listingId,
      version.version,
      listingStatus,
      version.manifest,
    );
    if (blocked !== null) {
      return yield* Effect.fail(new ListingConflict({ reason: blocked }));
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
      .run(
        "UPDATE agent_listings SET status = CASE WHEN ? = 'published' AND ? = 'in_review' THEN status ELSE ? END, updated_at = ? WHERE id = ?",
        [listingStatus, status, status, now, listingId],
      )
      .pipe(Effect.orDie);
    yield* db
      .run(
        "UPDATE listing_versions SET status = ? WHERE listing_id = ? AND version = ?",
        [status, listingId, version.version],
      )
      .pipe(Effect.orDie);
    const { recordStage } = yield* Effect.promise(() => import("../marketplace/clock.ts"));
    yield* recordStage(db, {
      listingId,
      authorId: String(listing.ownerId),
      stage: "submitted",
      at: new Date(),
    });
    return { ...outcome, status };
  });

export const runAuthorKit = (
  db: DatabaseImpl,
  userId: string,
  listingId: string,
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>,
): Effect.Effect<KitResult, ListingNotFound | ListingConflict> =>
  Effect.gen(function* () {
    const listing = yield* ownedListing(db, userId, listingId);
    if (listing === null) {
      return yield* Effect.fail(new ListingNotFound({}));
    }
    const current = yield* db
      .first(
        "SELECT v.manifest AS manifest, v.soul AS soul FROM agent_listings l JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.id = ?",
        [listingId],
      )
      .pipe(Effect.orDie);
    const manifest: Manifest =
      current === null
        ? { soul: "" }
        : manifestOf({
            soul: String(current.soul ?? ""),
            manifest:
              typeof current.manifest === "string" ? current.manifest : null,
          });
    if (manifest.runtime?.hosted === undefined) {
      return yield* Effect.fail(new ListingConflict({ reason: "not_hosted" }));
    }
    const runs = yield* kitRunsToday(db, listingId);
    if (runs >= kitDailyCap) {
      return yield* Effect.fail(
        new ListingConflict({ reason: "kit_cap_reached" }),
      );
    }
    const outcome = yield* runKitForListing(db, listingId, fetchImpl);
    if (outcome.result === null) {
      return yield* Effect.fail(
        new ListingConflict({ reason: outcome.error ?? "kit_failed" }),
      );
    }
    return outcome.result;
  });

