import * as Effect from "effect/Effect";
import { toResponse } from "./adapter.ts";
import { make as makeDatabase } from "./db/database.ts";
import type { Env } from "./env.ts";
import { handlePaystackWebhook } from "./payments/paystack.ts";
import { handleBreetWebhook } from "./payments/breet.ts";

export { SessionAgent } from "./session/agent.ts";
export { WalletAgent } from "./wallet/wallet.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/webhooks/paystack") {
      const exit = await Effect.runPromiseExit(
        handlePaystackWebhook(request, env, makeDatabase(env.DB)),
      );
      return exit._tag === "Success"
        ? exit.value
        : Response.json({ ok: false }, { status: 500 });
    }
    if (url.pathname === "/webhooks/breet") {
      const exit = await Effect.runPromiseExit(
        handleBreetWebhook(request, env, makeDatabase(env.DB)),
      );
      return exit._tag === "Success"
        ? exit.value
        : Response.json({ ok: false }, { status: 500 });
    }
    return toResponse(request, env);
  },
};
