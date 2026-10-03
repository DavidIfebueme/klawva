import * as Context from "effect/Context";

export interface Env {
  readonly DB: D1Database;
  readonly SESSION: DurableObjectNamespace;
  readonly AI: Ai;
  readonly ENV: string;
  readonly TELEGRAM_BOT_TOKEN: string;
  readonly TELEGRAM_WEBHOOK_SECRET: string;
}

export class WorkerEnv extends Context.Service<WorkerEnv, Env>()(
  "klawva/WorkerEnv",
) {}
