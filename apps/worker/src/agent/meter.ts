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

export const estimateNeurons = (params: {
  readonly model: string;
  readonly inChars: number;
  readonly outChars: number;
}): number | null => {
  const rate = neuronRates[params.model];
  if (rate === undefined) {
    return null;
  }
  return (
    ((params.inChars / charsPerToken) * rate.inPerMillion +
      (params.outChars / charsPerToken) * rate.outPerMillion) /
    1_000_000
  );
};

export interface AiUsage {
  readonly model: string;
  readonly inChars: number;
  readonly outChars: number;
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
    yield* bump(db, `ai:in-chars:${day}:${usage.model}`, usage.inChars);
    yield* bump(db, `ai:out-chars:${day}:${usage.model}`, usage.outChars);
    if (!usage.ok) {
      yield* bump(db, `ai:errors:${day}:${usage.model}`, 1);
    }
  });
