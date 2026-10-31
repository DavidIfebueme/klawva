import * as Effect from "effect/Effect";
import { sendEmail } from "../email/brevo.ts";
import type { DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";
import {
  AWS_DAILY_ALARM_MICROS,
  bedrockRateKnown,
  makeBedrockRuntime,
  withAwsCap,
} from "./bedrock.ts";
import {
  defaultToolAllowlist,
  makeRuntime,
  ModelError,
  toolSpecsFor,
  type AgentRuntimeImpl,
} from "./runtime.ts";
import { quotaSpentRecently, recordQuotaSpent } from "./meter.ts";

export const bedrockPrefix = "bedrock:";

export const bedrockEnabled = (env: Env): boolean =>
  typeof env.BEDROCK_ENABLED === "string" &&
  env.BEDROCK_ENABLED === "true" &&
  ((typeof env.AWS_BEDROCK_API_KEY === "string" && env.AWS_BEDROCK_API_KEY.length > 0) ||
    (typeof env.AWS_ACCESS_KEY_ID === "string" && env.AWS_ACCESS_KEY_ID.length > 0));

export const resolveBedrockModelId = (model: string): string => {
  const id = model.slice(bedrockPrefix.length);
  if (!bedrockRateKnown(id)) {
    throw new Error(
      `unknown bedrock model "${id}": add its published rate to the rate card before routing turns to it`,
    );
  }
  return id;
};

export const resolveRuntime = (
  env: Env,
  db: DatabaseImpl,
  model: string,
  allowlist: ReadonlyArray<string> = defaultToolAllowlist,
): AgentRuntimeImpl => {
  if (model.startsWith(bedrockPrefix) && bedrockEnabled(env)) {
    const bedrockModel = resolveBedrockModelId(model);
    const specs = toolSpecsFor(allowlist);
    const runtime = makeBedrockRuntime(
      {
        apiKey: env.AWS_BEDROCK_API_KEY,
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        region: typeof env.AWS_REGION === "string" && env.AWS_REGION.length > 0 ? env.AWS_REGION : "us-east-1",
        model: bedrockModel,
      },
      specs,
    );
    return withAwsCap(db, runtime, bedrockModel, () =>
      sendEmail({
        apiKey: env.BREVO_API_KEY,
        senderEmail: env.BREVO_SENDER_EMAIL,
        senderName: "Klawva",
        toEmail: env.ADMIN_EMAILS.split(",")[0]?.trim() ?? "",
        subject: "aws daily spend crossed the alarm line",
        html: `<p>aws bedrock spend crossed $${AWS_DAILY_ALARM_MICROS / 1_000_000} today. the hard cap is $10 and throttles, it never fails a paying call silently.</p>`,
      }).pipe(Effect.catch(() => Effect.void)),
    );
  }
  return withNeuronFallback(env, db, makeRuntime(env.AI, model, allowlist), allowlist);
};

const novaFallbackRuntime = (
  env: Env,
  db: DatabaseImpl,
  allowlist: ReadonlyArray<string>,
): AgentRuntimeImpl => {
  const runtime = makeBedrockRuntime(
    {
      apiKey: env.AWS_BEDROCK_API_KEY,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region: typeof env.AWS_REGION === "string" && env.AWS_REGION.length > 0 ? env.AWS_REGION : "us-east-1",
      model: "amazon.nova-micro-v1:0",
    },
    toolSpecsFor(allowlist),
  );
  return withAwsCap(db, runtime, "amazon.nova-micro-v1:0", () =>
    sendEmail({
      apiKey: env.BREVO_API_KEY,
      senderEmail: env.BREVO_SENDER_EMAIL,
      senderName: "Klawva",
      toEmail: env.ADMIN_EMAILS.split(",")[0]?.trim() ?? "",
      subject: "aws daily spend crossed the alarm line",
      html: "<p>aws bedrock spend crossed the alarm line today (the nova fallback served turns).</p>",
    }).pipe(Effect.catch(() => Effect.void)),
  );
};

export const neuronsSpent = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    const message = current instanceof Error ? current.message : String(current);
    if (message.includes("neurons") || message.includes("free allocation")) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? current.cause
        : undefined;
  }
  return false;
};

const novaBoilerplate = ["You do not identify as", "identity related questions"];

export const stripNovaBoilerplate = (text: string): string => {
  const trimmed = text.trimStart();
  for (const marker of novaBoilerplate) {
    const index = trimmed.indexOf(marker);
    if (index > 0) {
      const kept = trimmed.slice(0, index).trim();
      if (kept.length > 0) {
        return kept;
      }
    }
  }
  return trimmed.trim();
};

const withNeuronFallback = (
  env: Env,
  db: DatabaseImpl,
  primary: AgentRuntimeImpl,
  allowlist: ReadonlyArray<string>,
): AgentRuntimeImpl => {
  let fallback: AgentRuntimeImpl | null = null;
  const nova = (): AgentRuntimeImpl => {
    fallback = fallback ?? novaFallbackRuntime(env, db, allowlist);
    return fallback;
  };
  return {
    complete: (messages, withTools) =>
      Effect.gen(function* () {
        if (yield* quotaSpentRecently(db)) {
          if (bedrockEnabled(env)) {
            const result = yield* nova().complete(messages, withTools);
            return { ...result, text: stripNovaBoilerplate(result.text) };
          }
          return yield* Effect.fail(
            new ModelError({
              cause: new Error("workers ai daily neurons are spent"),
            }),
          );
        }
        return yield* primary.complete(messages, withTools).pipe(
          Effect.catch((error) => {
            if (!neuronsSpent(error)) {
              return Effect.fail(error);
            }
            return recordQuotaSpent(db).pipe(
              Effect.andThen(() =>
                bedrockEnabled(env)
                  ? nova()
                      .complete(messages, withTools)
                      .pipe(
                        Effect.map((result) => ({
                          ...result,
                          text: stripNovaBoilerplate(result.text),
                        })),
                      )
                  : Effect.fail(error),
              ),
            );
          }),
        );
      }),
  };
};
