import type { LexicalHit } from "./lexical.ts";
import type { SemanticHit } from "./semantic.ts";

const LEXICAL_WEIGHT = 0.45;
const SEMANTIC_WEIGHT = 0.55;
const RATING_WEIGHT = 0.05;
const SEMANTIC_FLOOR = 0.2;
const EXACT_PHRASE_SCORE = 1.5;
const MIN_PHRASE_CHARS = 3;
const RESULT_LIMIT = 40;

export interface Searchable {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly avgRating: number | null;
}

export interface Ranked {
  readonly id: string;
  readonly match: number;
  readonly why: string;
}

export interface RankInput {
  readonly rows: ReadonlyArray<Searchable>;
  readonly lexical: ReadonlyArray<LexicalHit>;
  readonly semantic: ReadonlyArray<SemanticHit>;
  readonly phrase: string;
}

const normalise = (
  hits: ReadonlyArray<{ readonly listingId: string; readonly score: number }>,
): ReadonlyMap<string, number> => {
  const scores = new Map<string, number>();
  for (const hit of hits) {
    scores.set(hit.listingId, hit.score);
  }
  if (scores.size === 0) {
    return scores;
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const score of scores.values()) {
    if (score < min) min = score;
    if (score > max) max = score;
  }
  if (max - min < 1e-9) {
    return new Map([...scores.keys()].map((key) => [key, 1]));
  }
  return new Map(
    [...scores.entries()].map(([key, score]) => [key, (score - min) / (max - min)]),
  );
};

const containsPhrase = (value: string, phrase: string): boolean =>
  phrase.length >= MIN_PHRASE_CHARS && value.toLowerCase().includes(phrase);

export const rankListings = (input: RankInput): ReadonlyArray<Ranked> => {
  const lexical = normalise(input.lexical);
  const semantic = new Map<string, number>();
  for (const hit of input.semantic) {
    if (hit.score < SEMANTIC_FLOOR) {
      continue;
    }
    semantic.set(hit.listingId, (hit.score - SEMANTIC_FLOOR) / (1 - SEMANTIC_FLOOR));
  }
  const hasExact = input.rows.some(
    (row) =>
      containsPhrase(row.name, input.phrase) || containsPhrase(row.tagline, input.phrase),
  );
  if (!hasExact && input.lexical.length === 0 && semantic.size === 0) {
    return [];
  }
  const ranked: Array<Ranked> = [];
  for (const row of input.rows) {
    const lex = lexical.get(row.id);
    const sem = semantic.get(row.id);
    const exact = containsPhrase(row.name, input.phrase) || containsPhrase(row.tagline, input.phrase);
    if (lex === undefined && sem === undefined && !exact) {
      continue;
    }
    let score: number;
    if (exact) {
      score = EXACT_PHRASE_SCORE;
    } else {
      score = (lex ?? 0) * LEXICAL_WEIGHT + (sem ?? 0) * SEMANTIC_WEIGHT;
    }
    if (row.avgRating !== null && Number.isFinite(row.avgRating)) {
      score += RATING_WEIGHT * (row.avgRating / 5);
    }
    const why = exact
      ? `the name or tagline says "${input.phrase}"`
      : lex !== undefined && sem !== undefined
        ? "word and meaning match"
        : lex !== undefined
          ? "word match"
          : "close in meaning";
    ranked.push({ id: row.id, match: Math.round(score * 1000) / 1000, why });
  }
  ranked.sort((left, right) => right.match - left.match || left.id.localeCompare(right.id));
  return ranked.slice(0, RESULT_LIMIT);
};
