import * as Effect from "effect/Effect";
import type { DatabaseImpl } from "../db/database.ts";

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

const bump = (
  db: DatabaseImpl,
  key: string,
  by: number,
): Effect.Effect<void> =>
  db
    .run(
      "INSERT INTO counters (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = value + ?, updated_at = excluded.updated_at",
      [key, by, new Date().toISOString(), by],
    )
    .pipe(Effect.catch(() => Effect.void));

export const recordAiUsage = (
  db: DatabaseImpl,
  usage: AiUsage,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const day = new Date().toISOString().slice(0, 10);
    yield* bump(db, `ai:calls:${day}:${usage.model}`, 1);
    yield* bump(db, `ai:in-tokens:${day}:${usage.model}`, usage.inTokens);
    yield* bump(db, `ai:out-tokens:${day}:${usage.model}`, usage.outTokens);
    if (!usage.ok) {
      yield* bump(db, `ai:errors:${day}:${usage.model}`, 1);
    }
  });

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
