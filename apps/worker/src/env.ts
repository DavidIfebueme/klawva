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
}

export class WorkerEnv extends Context.Service<WorkerEnv, Env>()(
  "klawva/WorkerEnv",
) {}
