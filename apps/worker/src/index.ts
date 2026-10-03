import { toResponse } from "./adapter.ts";
import type { Env } from "./env.ts";

export { SessionAgent } from "./session/agent.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/sessions\/([^/]+)(\/.*)?$/);
    if (match) {
      const sessionId = match[1];
      const rest = match[2] ?? "/state";
      const inner = new URL(request.url);
      inner.pathname = rest;
      const stub = env.SESSION.get(env.SESSION.idFromName(sessionId));
      return stub.fetch(new Request(inner, request));
    }
    return toResponse(request, env);
  },
};
