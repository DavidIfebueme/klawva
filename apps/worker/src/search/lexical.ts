import * as Effect from "effect/Effect";
import type { DatabaseImpl, Row } from "../db/database.ts";
import { requiredCoverage, tokenExpression, type ParsedQuery } from "./query.ts";

const LEXICAL_LIMIT = 40;
const COLUMN_WEIGHTS = "8.0, 4.0, 2.0, 1.0";

export interface LexicalHit {
  readonly listingId: string;
  readonly score: number;
}

interface TokenHit {
  readonly listingId: string;
  readonly score: number;
}

const tokenHits = (
  db: DatabaseImpl,
  token: string,
): Effect.Effect<ReadonlyArray<TokenHit>> =>
  db
    .all(
      `SELECT listing_id AS listingId, -bm25(listing_fts, ${COLUMN_WEIGHTS}) AS score FROM listing_fts WHERE listing_fts MATCH ? LIMIT ?`,
      [tokenExpression(token), LEXICAL_LIMIT],
    )
    .pipe(
      Effect.map((rows: ReadonlyArray<Row>) =>
        rows.map((row) => ({
          listingId: String(row.listingId),
          score: Number(row.score),
        })),
      ),
      Effect.catch(() => Effect.succeed([] as ReadonlyArray<TokenHit>)),
    );

export const lexicalHits = (
  db: DatabaseImpl,
  parsed: ParsedQuery,
): Effect.Effect<ReadonlyArray<LexicalHit>> =>
  Effect.gen(function* () {
    const perToken = yield* Effect.all(
      parsed.tokens.map((token) => tokenHits(db, token)),
      { concurrency: "unbounded" },
    );
    const totals = new Map<string, { sum: number; matched: number }>();
    for (const hits of perToken) {
      for (const hit of hits) {
        const current = totals.get(hit.listingId) ?? { sum: 0, matched: 0 };
        current.sum += hit.score;
        current.matched += 1;
        totals.set(hit.listingId, current);
      }
    }
    const required = requiredCoverage(parsed.tokens.length);
    const ranked: Array<LexicalHit> = [];
    for (const [listingId, total] of totals) {
      if (total.matched < required) {
        continue;
      }
      ranked.push({
        listingId,
        score: total.sum * (total.matched / parsed.tokens.length),
      });
    }
    ranked.sort((left, right) => right.score - left.score);
    return ranked.slice(0, LEXICAL_LIMIT);
  });
