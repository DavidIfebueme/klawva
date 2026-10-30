import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { AwsClient } from "aws4fetch";
import type { Env } from "../env.ts";

export const TITAN_MODEL = "amazon.titan-embed-text-v2:0";
export const EMBED_DIMENSIONS = 512;
const EMBED_TIMEOUT_MS = 800;
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;

export class EmbedError extends Schema.TaggedError<EmbedError>()("EmbedError", {
  reason: Schema.String,
}) {}

export interface EmbedConfig {
  readonly model: string;
  readonly region: string;
  readonly dimensions: number;
  readonly apiKey: string | undefined;
  readonly accessKeyId: string | undefined;
  readonly secretAccessKey: string | undefined;
}

export const embedConfigFrom = (env: Env): EmbedConfig | null => {
  const apiKey = env.AWS_BEDROCK_API_KEY ?? "";
  const accessKeyId = env.AWS_ACCESS_KEY_ID ?? "";
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY ?? "";
  const hasBearer = apiKey.length > 0;
  const hasSigV4 = accessKeyId.length > 0 && secretAccessKey.length > 0;
  if (!hasBearer && !hasSigV4) {
    return null;
  }
  return {
    model: TITAN_MODEL,
    region: env.AWS_REGION ?? "us-east-1",
    dimensions: EMBED_DIMENSIONS,
    apiKey: hasBearer ? apiKey : undefined,
    accessKeyId: hasSigV4 ? accessKeyId : undefined,
    secretAccessKey: hasSigV4 ? secretAccessKey : undefined,
  };
};

let failures = 0;
let openUntil = 0;

export const semanticAllowed = (now: number = Date.now()): boolean => now >= openUntil;

const noteFailure = (now: number): void => {
  failures += 1;
  if (failures >= BREAKER_THRESHOLD) {
    openUntil = now + BREAKER_COOLDOWN_MS;
    failures = 0;
  }
};

const noteSuccess = (): void => {
  failures = 0;
};

const EmbedResponse = Schema.Struct({ embedding: Schema.Array(Schema.Number) });

export const embedText = (
  config: EmbedConfig,
  text: string,
  timeoutMs: number = EMBED_TIMEOUT_MS,
): Effect.Effect<ReadonlyArray<number>, EmbedError> =>
  Effect.tryPromise({
    try: async () => {
      if (!semanticAllowed()) {
        throw new EmbedError({ reason: "breaker_open" });
      }
      const url = `https://bedrock-runtime.${config.region}.amazonaws.com/model/${encodeURIComponent(config.model)}/invoke`;
      const body = JSON.stringify({
        inputText: text,
        dimensions: config.dimensions,
        normalize: true,
      });
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.apiKey !== undefined) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }
      const client =
        config.apiKey === undefined
          ? new AwsClient({
              accessKeyId: config.accessKeyId ?? "",
              secretAccessKey: config.secretAccessKey ?? "",
              region: config.region,
              service: "bedrock",
            })
          : null;
      const response =
        client === null
          ? await fetch(url, {
              method: "POST",
              headers,
              body,
              signal: AbortSignal.timeout(timeoutMs),
            })
          : await client.fetch(url, {
              method: "POST",
              headers,
              body,
              signal: AbortSignal.timeout(timeoutMs),
            });
      if (!response.ok) {
        throw new EmbedError({
          reason: `bedrock ${response.status}: ${(await response.text()).slice(0, 120)}`,
        });
      }
      const raw: unknown = await response.json();
      const decoded = Schema.decodeUnknownSync(EmbedResponse)(raw);
      noteSuccess();
      return decoded.embedding;
    },
    catch: (cause) => {
      const error =
        cause instanceof EmbedError ? cause : new EmbedError({ reason: String(cause) });
      if (error.reason !== "breaker_open") {
        noteFailure(Date.now());
      }
      return error;
    },
  });
