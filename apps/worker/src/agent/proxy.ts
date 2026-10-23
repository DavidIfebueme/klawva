import * as Effect from "effect/Effect";
import { sendEmail } from "../email/brevo.ts";
import type { DatabaseImpl } from "../db/database.ts";
import type { Env } from "../env.ts";
import {
  AWS_DAILY_ALARM_MICROS,
  makeBedrockRuntime,
  withAwsCap,
} from "./bedrock.ts";
import {
  defaultToolAllowlist,
  makeRuntime,
  toolSpecsFor,
  type AgentRuntimeImpl,
} from "./runtime.ts";

export const bedrockPrefix = "bedrock:";

export const bedrockEnabled = (env: Env): boolean =>
  typeof env.BEDROCK_ENABLED === "string" &&
  env.BEDROCK_ENABLED === "true" &&
  ((typeof env.AWS_BEDROCK_API_KEY === "string" && env.AWS_BEDROCK_API_KEY.length > 0) ||
    (typeof env.AWS_ACCESS_KEY_ID === "string" && env.AWS_ACCESS_KEY_ID.length > 0));

export const resolveRuntime = (
  env: Env,
  db: DatabaseImpl,
  model: string,
  allowlist: ReadonlyArray<string> = defaultToolAllowlist,
): AgentRuntimeImpl => {
  if (model.startsWith(bedrockPrefix) && bedrockEnabled(env)) {
    const bedrockModel = model.slice(bedrockPrefix.length);
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
    return withAwsCap(db, runtime, () =>
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
  return makeRuntime(env.AI, model, allowlist);
};
