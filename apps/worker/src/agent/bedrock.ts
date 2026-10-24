import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { AwsClient } from "aws4fetch";
import type { DatabaseImpl } from "../db/database.ts";
import type {
  AgentRuntimeImpl,
  ChatMessage,
  ModelResult,
  ToolCall,
} from "./runtime.ts";
import { ModelError } from "./runtime.ts";

export interface BedrockConfig {
  readonly apiKey?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly region: string;
  readonly model: string;
}

export interface BedrockToolSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

const ConverseContentBlock = Schema.Struct({
  text: Schema.optionalKey(Schema.String),
  toolUse: Schema.optionalKey(
    Schema.Struct({
      toolUseId: Schema.String,
      name: Schema.String,
      input: Schema.Unknown,
    }),
  ),
});

const ConverseResponse = Schema.Struct({
  output: Schema.Struct({
    message: Schema.Struct({
      role: Schema.String,
      content: Schema.Array(ConverseContentBlock),
    }),
  }),
  usage: Schema.Struct({
    inputTokens: Schema.Number,
    outputTokens: Schema.Number,
  }),
});

export const toConverseMessages = (messages: ReadonlyArray<ChatMessage>) => {
  const system: Array<{ text: string }> = [];
  const turns: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (message.role === "system") {
      system.push({ text: message.content });
      continue;
    }
    if (message.role === "tool") {
      turns.push({ role: "user", content: [{ text: message.content }] });
      continue;
    }
    turns.push({ role: message.role, content: [{ text: message.content }] });
  }
  return { system, turns };
};

export const toolConfigFor = (specs: ReadonlyArray<BedrockToolSpec>) =>
  specs.length === 0
    ? {}
    : {
        toolConfig: {
          tools: specs.map((spec) => ({
            toolSpec: {
              name: spec.name,
              description: spec.description,
              inputSchema: { json: spec.parameters },
            },
          })),
        },
      };

export const makeBedrockRuntime = (
  config: BedrockConfig,
  toolSpecs: ReadonlyArray<BedrockToolSpec>,
): AgentRuntimeImpl => {
  const url = `https://bedrock-runtime.${config.region}.amazonaws.com/model/${encodeURIComponent(config.model)}/converse`;
  const useBearer = typeof config.apiKey === "string" && config.apiKey.length > 0;
  const call = useBearer
    ? (body: string) =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body,
        })
    : (body: string) => {
        const client = new AwsClient({
          accessKeyId: config.accessKeyId ?? "",
          secretAccessKey: config.secretAccessKey ?? "",
          region: config.region,
          service: "bedrock",
        });
        return client.fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      };
  return {
    complete: (messages, withTools) =>
      Effect.tryPromise({
        try: async () => {
          const { system, turns } = toConverseMessages(messages);
          const body = JSON.stringify({
            messages: turns,
            ...(system.length > 0 ? { system } : {}),
            ...(withTools ? toolConfigFor(toolSpecs) : {}),
          });
          const response = await call(body);
          if (!response.ok) {
            throw new Error(`bedrock ${response.status}: ${await response.text()}`);
          }
          const raw: unknown = await response.json();
          const decoded = Schema.decodeUnknownSync(ConverseResponse)(raw);
          const toolCalls: ToolCall[] = [];
          let text = "";
          for (const block of decoded.output.message.content) {
            if (block.text !== undefined) {
              text += block.text;
            }
            if (block.toolUse !== undefined) {
              toolCalls.push({
                id: block.toolUse.toolUseId,
                name: block.toolUse.name,
                arguments: JSON.stringify(block.toolUse.input ?? {}),
              });
            }
          }
          const result: ModelResult = {
            text,
            toolCalls,
            usage: {
              inTokens: decoded.usage.inputTokens,
              outTokens: decoded.usage.outputTokens,
            },
          };
          return result;
        },
        catch: (cause) => new ModelError({ cause }),
      }),
  };
};

const dollarMicros = 1_000_000;

const bedrockRates: Record<string, { inPerMillion: number; outPerMillion: number }> = {
  "amazon.nova-micro-v1:0": { inPerMillion: 0.035, outPerMillion: 0.14 },
};

export const bedrockRateKnown = (model: string): boolean =>
  bedrockRates[model] !== undefined;

export const bedrockCostMicros = (params: {
  readonly model: string;
  readonly inTokens: number;
  readonly outTokens: number;
}): number | null => {
  const rate = bedrockRates[params.model];
  if (rate === undefined) {
    return null;
  }
  return Math.ceil(
    ((params.inTokens * rate.inPerMillion + params.outTokens * rate.outPerMillion) /
      1_000_000) *
      dollarMicros,
  );
};

export const AWS_DAILY_CAP_MICROS = 10 * dollarMicros;
export const AWS_DAILY_ALARM_MICROS = 5 * dollarMicros;

export const dayAwsSpendMicros = (db: DatabaseImpl): Effect.Effect<number> =>
  Effect.gen(function* () {
    const day = new Date().toISOString().slice(0, 10);
    const row = yield* db
      .first("SELECT value AS value FROM counters WHERE key = ?", [`aws:spend-micros:${day}`])
      .pipe(Effect.orDie);
    return row === null ? 0 : Number(row.value);
  });

export const recordAwsUsage = (
  db: DatabaseImpl,
  params: { readonly model: string; readonly inTokens: number; readonly outTokens: number },
): Effect.Effect<void> => {
  const cost = bedrockCostMicros(params);
  if (cost === null) {
    return Effect.void;
  }
  const day = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  return db
    .run(
      "INSERT INTO counters (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = value + ?, updated_at = excluded.updated_at",
      [`aws:spend-micros:${day}`, cost, now, cost],
    )
    .pipe(Effect.catch(() => Effect.void));
};

export const withAwsCap = (
  db: DatabaseImpl,
  runtime: AgentRuntimeImpl,
  model: string,
  onAlarm: () => Effect.Effect<void>,
): AgentRuntimeImpl => ({
  complete: (messages, withTools) =>
    Effect.gen(function* () {
      const before = yield* dayAwsSpendMicros(db);
      if (before >= AWS_DAILY_CAP_MICROS) {
        return yield* Effect.fail(
          new ModelError({ cause: "aws_daily_spend_cap_reached" }),
        );
      }
      const result = yield* runtime.complete(messages, withTools);
      yield* recordAwsUsage(db, {
        model,
        inTokens: result.usage.inTokens,
        outTokens: result.usage.outTokens,
      });
      const after = yield* dayAwsSpendMicros(db);
      if (before < AWS_DAILY_ALARM_MICROS && after >= AWS_DAILY_ALARM_MICROS) {
        yield* onAlarm();
      }
      return result;
    }),
});

export interface MigrationTrigger {
  readonly neuronToday: number;
  readonly neuronCap: number;
  readonly hotStreakDays: number;
  readonly maxTurnsSingleHire: number;
  readonly shouldAlert: boolean;
  readonly shouldMigrate: boolean;
}

export const measureMigrationTrigger = (
  db: DatabaseImpl,
  neuronToday: number,
  neuronCap: number,
): Effect.Effect<MigrationTrigger> =>
  Effect.gen(function* () {
    const pct = neuronCap === 0 ? 0 : neuronToday / neuronCap;
    const day = new Date().toISOString().slice(0, 10);
    const streakRow = yield* db
      .first("SELECT value AS value FROM counters WHERE key = ?", [`trigger:neuron-hot-streak`])
      .pipe(Effect.orDie);
    const lastDayRow = yield* db
      .first("SELECT value AS value FROM counters WHERE key = ?", [`trigger:neuron-hot-last-day`])
      .pipe(Effect.orDie);
    const previousStreak = streakRow === null ? 0 : Number(streakRow.value);
    const hot = pct >= 0.7;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const continues = lastDayRow !== null && String(lastDayRow.value) === yesterday;
    const streak = hot ? (continues ? previousStreak + 1 : 1) : 0;
    const now = new Date().toISOString();
    yield* db
      .batch([
        {
          sql: "INSERT INTO counters (key, value, updated_at) VALUES ('trigger:neuron-hot-streak', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
          params: [streak, now],
        },
        {
          sql: "INSERT INTO counters (key, value, updated_at) VALUES ('trigger:neuron-hot-last-day', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
          params: [hot ? day : String(lastDayRow?.value ?? ""), now],
        },
      ])
      .pipe(Effect.catch(() => Effect.void));
    const turnRow = yield* db
      .first(
        "SELECT MAX(spent_minor) AS maxSpent FROM sessions WHERE updated_at >= ?",
        [new Date(Date.now() - 86_400_000).toISOString()],
      )
      .pipe(Effect.orDie);
    const maxTurns = turnRow === null || turnRow.maxSpent === null ? 0 : Math.floor(Number(turnRow.maxSpent) / 50);
    return {
      neuronToday,
      neuronCap,
      hotStreakDays: streak,
      maxTurnsSingleHire: maxTurns,
      shouldAlert: pct >= 0.7,
      shouldMigrate: streak >= 2 || maxTurns > 100,
    };
  });
