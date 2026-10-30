import * as Effect from "effect/Effect";
import type { DatabaseError, DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";
import { embedConfigFrom, embedText } from "./embed.ts";
import { listingText } from "./text.ts";

const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const encodeVector = (values: ReadonlyArray<number>): string => {
  const floats = Float32Array.from(values);
  const bytes = new Uint8Array(floats.buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
};

export interface IndexResult {
  readonly embedded: boolean;
}

export const removeFromSearch = (
  db: DatabaseImpl,
  listingId: string,
): Effect.Effect<void> =>
  db
    .batch([
      { sql: "DELETE FROM listing_fts WHERE listing_id = ?", params: [listingId] },
      { sql: "DELETE FROM listing_embeddings WHERE listing_id = ?", params: [listingId] },
    ])
    .pipe(Effect.catch(() => Effect.void));

export const indexListing = (
  env: Env,
  db: DatabaseImpl,
  listingId: string,
  at: Date = new Date(),
): Effect.Effect<IndexResult, DatabaseError> =>
  Effect.gen(function* () {
    const row = yield* db
      .first(
        "SELECT l.name AS name, l.tagline AS tagline, l.category AS category, COALESCE(v.brief_fields, '[]') AS briefFields, COALESCE(v.soul, '') AS soul FROM agent_listings l LEFT JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.id = ? AND l.status = 'published'",
        [listingId],
      );
    if (row === null) {
      yield* removeFromSearch(db, listingId);
      return { embedded: false };
    }
    const name = String(row.name);
    const tagline = String(row.tagline);
    const category = String(row.category);
    const text = listingText({
      name,
      tagline,
      category,
      briefFields: String(row.briefFields),
      soul: String(row.soul),
    });
    yield* db
      .batch([
        { sql: "DELETE FROM listing_fts WHERE listing_id = ?", params: [listingId] },
        {
          sql: "INSERT INTO listing_fts (listing_id, name, tagline, category, body) VALUES (?, ?, ?, ?, ?)",
          params: [listingId, name, tagline, category, text.body],
        },
      ])
      .pipe(Effect.catch(() => Effect.void));
    const config = embedConfigFrom(env);
    if (config === null) {
      return { embedded: false };
    }
    const hash = yield* Effect.promise(() => sha256Hex(text.embedding));
    const existing = yield* db
      .first(
        "SELECT text_hash AS textHash, model AS model FROM listing_embeddings WHERE listing_id = ?",
        [listingId],
      );
    if (
      existing !== null &&
      String(existing.textHash) === hash &&
      String(existing.model) === config.model
    ) {
      return { embedded: true };
    }
    const evaluated = yield* embedText(config, text.embedding, 5_000).pipe(
      Effect.map((embedding) => ({ ok: true as const, embedding })),
      Effect.catch(() =>
        Effect.succeed({ ok: false as const, embedding: [] as ReadonlyArray<number> }),
      ),
    );
    if (!evaluated.ok) {
      return { embedded: false };
    }
    yield* db
      .run(
        "INSERT INTO listing_embeddings (listing_id, model, dims, vector, text_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(listing_id) DO UPDATE SET model = excluded.model, dims = excluded.dims, vector = excluded.vector, text_hash = excluded.text_hash, updated_at = excluded.updated_at",
        [
          listingId,
          config.model,
          config.dimensions,
          encodeVector(evaluated.embedding),
          hash,
          at.toISOString(),
        ],
      );
    return { embedded: true };
  });

export interface ReindexOptions {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ReindexResult {
  readonly listings: number;
  readonly embedded: number;
  readonly nextCursor: string | null;
}

const REINDEX_PAGE = 25;
const REINDEX_MAX_PAGE = 100;

export const reindexAll = (
  env: Env,
  db: DatabaseImpl,
  options: ReindexOptions = {},
  at: Date = new Date(),
): Effect.Effect<ReindexResult, DatabaseError> =>
  Effect.gen(function* () {
    const limit = Math.min(
      Math.max(Math.trunc(options.limit ?? REINDEX_PAGE), 1),
      REINDEX_MAX_PAGE,
    );
    const rows = yield* db.all(
      "SELECT id AS id FROM agent_listings WHERE status = 'published' AND id > ? ORDER BY id LIMIT ?",
      [options.cursor ?? "", limit],
    );
    let embedded = 0;
    for (const entry of rows) {
      const result = yield* indexListing(env, db, String(entry.id), at);
      if (result.embedded) {
        embedded += 1;
      }
    }
    const last = rows[rows.length - 1];
    return {
      listings: rows.length,
      embedded,
      nextCursor: rows.length === limit && last !== undefined ? String(last.id) : null,
    };
  });
