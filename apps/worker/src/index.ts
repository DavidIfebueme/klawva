import { toResponse } from "./adapter.ts";

export { SessionCounter } from "./session/session-counter.ts";

interface Env {
  DB: D1Database;
  SESSION: DurableObjectNamespace;
  AI: Ai;
  ENV: string;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    return toResponse(request);
  },
};
