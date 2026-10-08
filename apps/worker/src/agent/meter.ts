import * as Effect from "effect/Effect";
import type { DatabaseImpl, Statement } from "../db/database.ts";

interface NeuronRate {
  readonly inPerMillion: number;
  readonly outPerMillion: number;
}

const neuronRates: Record<string, NeuronRate> = {
  "@cf/zai-org/glm-4.7-flash": { inPerMillion: 5500, outPerMillion: 36400 },
};

const charsPerToken = 4;

export const charsToTokens = (chars: number): number =>
  Math.ceil(chars / charsPerToken);

export const estimateNeurons = (params: {
  readonly model: string;
  readonly inTokens: number;
  readonly outTokens: number;
}): number | null => {
  const rate = neuronRates[params.model];
  if (rate === undefined) {
    return null;
  }
  return (
    (params.inTokens * rate.inPerMillion +
      params.outTokens * rate.outPerMillion) /
    1_000_000
  );
};

export interface AiUsage {
  readonly model: string;
  readonly inTokens: number;
  readonly outTokens: number;
  readonly ok: boolean;
}

const counterSql =
  "INSERT INTO counters (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = value + ?, updated_at = excluded.updated_at";

const counter = (key: string, by: number, now: string): Statement => ({
  sql: counterSql,
  params: [key, by, now, by],
});

export const recordAiUsage = (
  db: DatabaseImpl,
  usage: AiUsage,
): Effect.Effect<void> => {
  const day = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const statements: Statement[] = [
    counter(`ai:calls:${day}:${usage.model}`, 1, now),
    counter(`ai:in-tokens:${day}:${usage.model}`, usage.inTokens, now),
    counter(`ai:out-tokens:${day}:${usage.model}`, usage.outTokens, now),
  ];
  if (!usage.ok) {
    statements.push(counter(`ai:errors:${day}:${usage.model}`, 1, now));
  }
  return db.batch(statements).pipe(Effect.catch(() => Effect.void));
};

export const NEURON_DAILY_CAP = 9000;

export const dayNeurons = (
  db: DatabaseImpl,
  day: string,
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const rows = yield* db
      .all(
        "SELECT key AS key, value AS value FROM counters WHERE key LIKE 'ai:in-tokens:%' OR key LIKE 'ai:out-tokens:%'",
      )
      .pipe(Effect.orDie);
    const inPrefix = `ai:in-tokens:${day}:`;
    const outPrefix = `ai:out-tokens:${day}:`;
    const inTokens: Record<string, number> = {};
    const outTokens: Record<string, number> = {};
    for (const row of rows) {
      const key = String(row.key);
      const value = Number(row.value);
      if (key.startsWith(inPrefix)) {
        inTokens[key.slice(inPrefix.length)] = value;
      } else if (key.startsWith(outPrefix)) {
        outTokens[key.slice(outPrefix.length)] = value;
      }
    }
    let total = 0;
    for (const model of Object.keys({ ...inTokens, ...outTokens })) {
      const estimate = estimateNeurons({
        model,
        inTokens: inTokens[model] ?? 0,
        outTokens: outTokens[model] ?? 0,
      });
      if (estimate !== null) {
        total += estimate;
      }
    }
    return total;
  });

export const checkNeuronBudget = (
  db: DatabaseImpl,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const day = new Date().toISOString().slice(0, 10);
    return (yield* dayNeurons(db, day)) < NEURON_DAILY_CAP;
  });
