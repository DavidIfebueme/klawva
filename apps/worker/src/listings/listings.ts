import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { defaultModel, defaultToolAllowlist } from "../agent/runtime.ts";
import { soulFor } from "../agent/souls.ts";
import type { DatabaseImpl } from "../db/database.ts";
import { type Manifest } from "../db/schema.ts";
import { definitions, type ListingDefinition } from "./definitions.ts";

export class ListingError extends Schema.TaggedError<ListingError>()(
  "ListingError",
  {
    reason: Schema.String,
  },
) {}

export const manifestFor = (
  definition: ListingDefinition,
  soul: string,
): Manifest => ({
  soul,
  ...(definition.voice === undefined ? {} : { voice: definition.voice }),
  ...(definition.phone === undefined ? {} : { phone: definition.phone }),
  ...(definition.desktop === undefined ? {} : { desktop: definition.desktop }),
});

export const encodeManifest = (manifest: Manifest): string =>
  JSON.stringify(manifest);

export interface VersionContent {
  readonly manifest: Manifest;
  readonly briefFields: ReadonlyArray<string>;
  readonly toolAllowlist: ReadonlyArray<string>;
  readonly model: string;
  readonly budgetMinor: number;
}

export const manifestHash = (
  content: VersionContent,
): Effect.Effect<string, ListingError> =>
  Effect.tryPromise({
    try: async () => {
      const bytes = new TextEncoder().encode(JSON.stringify(content));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    },
    catch: (cause) => new ListingError({ reason: String(cause) }),
  });

export const seedListings = (
  db: DatabaseImpl,
): Effect.Effect<number, ListingError> =>
  Effect.gen(function* () {
    let count = 0;
    for (const definition of definitions) {
      const soul = soulFor(definition.agentId);
      const manifest = manifestFor(definition, soul);
      const hash = yield* manifestHash({
        manifest,
        briefFields: definition.briefFields,
        toolAllowlist: defaultToolAllowlist,
        model: defaultModel,
        budgetMinor: definition.budgetMinor,
      });
      const manifestJson = encodeManifest(manifest);
      const now = new Date().toISOString();
      yield* db
        .run(
          "INSERT INTO agent_listings (id, owner_id, slug, name, tagline, category, status, price_minor, current_version, created_at, updated_at) VALUES (?, 'system', ?, ?, ?, ?, 'published', ?, 1, ?, ?) ON CONFLICT(slug) DO UPDATE SET name = excluded.name, tagline = excluded.tagline, category = excluded.category, price_minor = excluded.price_minor, status = 'published', updated_at = excluded.updated_at",
          [
            crypto.randomUUID(),
            definition.slug,
            definition.name,
            definition.tagline,
            definition.category,
            definition.priceMinor,
            now,
            now,
          ],
        )
        .pipe(Effect.orDie);
      const listing = yield* db
        .first("SELECT id FROM agent_listings WHERE slug = ?", [definition.slug])
        .pipe(Effect.orDie);
      if (listing === null) {
        continue;
      }
      yield* db
        .run(
          "INSERT INTO listing_versions (id, listing_id, version, manifest_hash, soul, manifest, brief_fields, tool_allowlist, model, budget_minor, score, reviewed_by, reviewed_at, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, 'system', ?, ?) ON CONFLICT(listing_id, version) DO UPDATE SET manifest_hash = excluded.manifest_hash, soul = excluded.soul, manifest = excluded.manifest, brief_fields = excluded.brief_fields, tool_allowlist = excluded.tool_allowlist, model = excluded.model, budget_minor = excluded.budget_minor",
          [
            crypto.randomUUID(),
            String(listing.id),
            hash,
            soul,
            manifestJson,
            JSON.stringify(definition.briefFields),
            JSON.stringify(defaultToolAllowlist),
            defaultModel,
            definition.budgetMinor,
            now,
            now,
          ],
        )
        .pipe(Effect.orDie);
      count += 1;
    }
    return count;
  });
