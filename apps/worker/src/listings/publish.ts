import * as Effect from "effect/Effect";
import { defaultModel, type AgentRuntimeImpl } from "../agent/runtime.ts";
import { soulFor } from "../agent/souls.ts";
import type { DatabaseImpl } from "../db/database.ts";
import type { ListingStatus } from "../db/schema.ts";
import { bandFor, runEval, type Band } from "../eval/eval.ts";
import { manifestHash } from "./listings.ts";
import type { ListingDefinition } from "./definitions.ts";

export const publishFeeMinor = 2000;

export const statusForBand = (band: Band): ListingStatus => {
  if (band === "auto") {
    return "published";
  }
  if (band === "human") {
    return "in_review";
  }
  return "rejected";
};

export const createDraft = (
  db: DatabaseImpl,
  params: {
    readonly ownerId: string;
    readonly slug: string;
    readonly name: string;
    readonly tagline: string;
    readonly category: string;
    readonly agentId: string;
    readonly priceMinor: number;
    readonly briefFields: ReadonlyArray<string>;
  },
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    yield* db
      .run(
        "INSERT INTO agent_listings (id, owner_id, slug, name, tagline, category, status, price_minor, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, 1, ?, ?)",
        [
          id,
          params.ownerId,
          params.slug,
          params.name,
          params.tagline,
          params.category,
          params.priceMinor,
          now,
          now,
        ],
      )
      .pipe(Effect.orDie);
    const definition: ListingDefinition = {
      slug: params.slug,
      name: params.name,
      tagline: params.tagline,
      category: params.category,
      agentId: params.agentId,
      briefFields: params.briefFields,
      priceMinor: params.priceMinor,
    };
    const hash = yield* manifestHash(definition).pipe(Effect.orDie);
    yield* db
      .run(
        "INSERT INTO listing_versions (id, listing_id, version, manifest_hash, soul, brief_fields, tool_allowlist, model, score, reviewed_by, reviewed_at, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)",
        [
          crypto.randomUUID(),
          id,
          hash,
          soulFor(params.agentId),
          JSON.stringify(params.briefFields),
          JSON.stringify(["fetch_url"]),
          defaultModel,
          now,
        ],
      )
      .pipe(Effect.orDie);
    return id;
  });

export interface SubmitResult {
  readonly score: number;
  readonly band: Band;
  readonly status: ListingStatus;
}

export const submitListing = (
  db: DatabaseImpl,
  runtime: AgentRuntimeImpl,
  listingId: string,
): Effect.Effect<SubmitResult | null> =>
  Effect.gen(function* () {
    const listing = yield* db
      .first(
        "SELECT current_version AS version FROM agent_listings WHERE id = ? AND status IN ('draft','rejected')",
        [listingId],
      )
      .pipe(Effect.orDie);
    if (listing === null) {
      return null;
    }
    const versionNumber = Number(listing.version);
    const version = yield* db
      .first(
        "SELECT soul AS soul FROM listing_versions WHERE listing_id = ? AND version = ?",
        [listingId, versionNumber],
      )
      .pipe(Effect.orDie);
    if (version === null) {
      return null;
    }
    const result = yield* runEval({
      runtime,
      soul: String(version.soul),
      brief: {
        task: "Describe what you do and how you would approach the employer's task.",
      },
      cases: [
        "Summarize your role in one sentence.",
        "List what you can do.",
      ],
    }).pipe(Effect.orDie);
    const status = statusForBand(result.band);
    const now = new Date().toISOString();
    yield* db
      .run(
        "UPDATE listing_versions SET score = ? WHERE listing_id = ? AND version = ?",
        [result.score, listingId, versionNumber],
      )
      .pipe(Effect.orDie);
    yield* db
      .run("UPDATE agent_listings SET status = ?, updated_at = ? WHERE id = ?", [
        status,
        now,
        listingId,
      ])
      .pipe(Effect.orDie);
    return { score: result.score, band: result.band, status };
  });

export const reviewListing = (
  db: DatabaseImpl,
  listingId: string,
  approve: boolean,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const status: ListingStatus = approve ? "published" : "rejected";
    const now = new Date().toISOString();
    yield* db
      .run(
        "UPDATE agent_listings SET status = ?, updated_at = ? WHERE id = ? AND status = 'in_review'",
        [status, now, listingId],
      )
      .pipe(Effect.orDie);
    return true;
  });
