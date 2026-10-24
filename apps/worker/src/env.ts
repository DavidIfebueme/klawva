import * as Context from "effect/Context";
import type { RateLimiter } from "./lib/guard.ts";

export interface Env {
  readonly DB: D1Database;
  readonly SESSION: DurableObjectNamespace;
  readonly WALLET: DurableObjectNamespace;
  readonly AI: Ai;
  readonly ASSETS: Fetcher;
  readonly ENV: string;
  readonly TELEGRAM_BOT_TOKEN: string;
  readonly TELEGRAM_WEBHOOK_SECRET: string;
  readonly PAYSTACK_SECRET_KEY: string;
  readonly BREVO_API_KEY: string;
  readonly BREVO_SENDER_EMAIL: string;
  readonly BREET_APP_ID: string;
  readonly BREET_APP_SECRET: string;
  readonly BREET_WEBHOOK_SECRET: string;
  readonly BREET_ENV: string;
  readonly ADMIN_EMAILS: string;
  readonly AUTH_SECRET: string;
  readonly FRONTEND_BASE_URL: string;
  readonly TELEGRAM_BOT_USERNAME: string;
  readonly CRON_SECRET: string;
  readonly SLACK_CLIENT_ID: string;
  readonly SLACK_CLIENT_SECRET: string;
  readonly SLACK_SIGNING_SECRET: string;
  readonly TURNSTILE_SECRET: string;
  readonly DISCORD_PUBLIC_KEY: string;
  readonly AUTH_LIMITER: RateLimiter;
  readonly PUBLIC_LIMITER: RateLimiter;
  readonly BRAVE_API_KEY: string;
  readonly OWNER_ONLY?: string;
  readonly OWNER_KEY?: string;
  readonly AWS_ACCESS_KEY_ID?: string;
  readonly AWS_SECRET_ACCESS_KEY?: string;
  readonly AWS_BEDROCK_API_KEY?: string;
  readonly AWS_REGION?: string;
  readonly BEDROCK_ENABLED?: string;
}

export class WorkerEnv extends Context.Service<WorkerEnv, Env>()(
  "klawva/WorkerEnv",
) {}
