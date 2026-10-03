import * as Context from "effect/Context";

export interface Env {
  readonly DB: D1Database;
  readonly SESSION: DurableObjectNamespace;
  readonly WALLET: DurableObjectNamespace;
  readonly AI: Ai;
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
}

export class WorkerEnv extends Context.Service<WorkerEnv, Env>()(
  "klawva/WorkerEnv",
) {}
