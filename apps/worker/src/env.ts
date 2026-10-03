import * as Context from "effect/Context";

export interface Env {
  readonly DB: D1Database;
  readonly SESSION: DurableObjectNamespace;
  readonly AI: Ai;
  readonly ENV: string;
}

export class WorkerEnv extends Context.Service<WorkerEnv, Env>()(
  "klawva/WorkerEnv",
) {}
