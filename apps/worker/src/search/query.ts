const MAX_QUERY_CHARS = 200;
const MAX_TOKENS = 12;
const MIN_QUERY_CHARS = 2;
const MIN_TOKEN_CHARS = 2;

const stopwords = new Set([
  "a", "an", "and", "are", "at", "be", "can", "could", "do", "does", "for", "from",
  "has", "have", "help", "i", "in", "is", "it", "me", "my", "need", "of", "on", "or",
  "people", "person", "please", "some", "someone", "that", "the", "this", "to", "want",
  "we", "who", "will", "with", "would", "you", "your",
]);

export interface ParsedQuery {
  readonly phrase: string;
  readonly tokens: ReadonlyArray<string>;
}

export const parseQuery = (input: string): ParsedQuery | null => {
  const normalized = input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_CHARS)
    .trim();
  if (normalized.length < MIN_QUERY_CHARS) {
    return null;
  }
  const seen = new Set<string>();
  const kept: Array<string> = [];
  const all: Array<string> = [];
  for (const token of normalized.split(/[^\p{L}\p{N}]+/u)) {
    if (token.length < MIN_TOKEN_CHARS || seen.has(token)) {
      continue;
    }
    seen.add(token);
    all.push(token);
    if (!stopwords.has(token)) {
      kept.push(token);
    }
    if (all.length === MAX_TOKENS) {
      break;
    }
  }
  const tokens = kept.length > 0 ? kept : all;
  if (tokens.length === 0) {
    return null;
  }
  return { phrase: normalized, tokens };
};

export const tokenExpression = (token: string): string => `"${token}"*`;

export const requiredCoverage = (tokenCount: number): number =>
  tokenCount <= 2 ? tokenCount : Math.ceil(tokenCount / 2);
