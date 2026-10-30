import * as Effect from "effect/Effect";
import type { DatabaseImpl, Row } from "../db/database.ts";
import type { Env } from "../env.ts";
import { embedConfigFrom, embedText } from "./embed.ts";

const SEMANTIC_LIMIT = 40;

export interface SemanticHit {
  readonly listingId: string;
  readonly score: number;
}

const base64 = /^[A-Za-z0-9+/]+={0,2}$/;

const decodeVector = (encoded: string): Float32Array | null => {
  if (!base64.test(encoded) || encoded.length % 4 !== 0) {
    return null;
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Float32Array(bytes.buffer);
};

const cosine = (a: Float32Array, b: Float32Array): number => {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / Math.sqrt(normA * normB);
};

export const semanticHits = (
  env: Env,
  db: DatabaseImpl,
  phrase: string,
): Effect.Effect<ReadonlyArray<SemanticHit>> =>
  Effect.gen(function* () {
    const config = embedConfigFrom(env);
    if (config === null) {
      return [];
    }
    const evaluated = yield* embedText(config, phrase).pipe(
      Effect.map((embedding) => ({ ok: true as const, embedding })),
      Effect.catch(() => Effect.succeed({ ok: false as const, embedding: [] })),
    );
    if (!evaluated.ok) {
      return [];
    }
    const rows = yield* db
      .all("SELECT listing_id AS listingId, vector AS vector FROM listing_embeddings WHERE model = ?", [
        config.model,
      ])
      .pipe(Effect.catch(() => Effect.succeed([])));
    const query = Float32Array.from(evaluated.embedding);
    const hits: Array<SemanticHit> = [];
    for (const row of rows) {
      const encoded = typeof row.vector === "string" ? row.vector : "";
      if (encoded.length === 0) {
        continue;
      }
      const stored = decodeVector(encoded);
      if (stored === null) {
        continue;
      }
      if (stored.length !== query.length) {
        continue;
      }
      hits.push({ listingId: String(row.listingId), score: cosine(query, stored) });
    }
    hits.sort((left, right) => right.score - left.score);
    return hits.slice(0, SEMANTIC_LIMIT);
  });
