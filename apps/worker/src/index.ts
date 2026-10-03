import * as Effect from "effect/Effect";
import { toResponse } from "./adapter.ts";
import { make as makeDatabase } from "./db/database.ts";
import type { Env } from "./env.ts";
import { handlePaystackWebhook } from "./payments/paystack.ts";
import { handleBreetWebhook } from "./payments/breet.ts";

export { SessionAgent } from "./session/agent.ts";
export { WalletAgent } from "./wallet/wallet.ts";

const forward = (
  request: Request,
  match: RegExpMatchArray,
  namespace: DurableObjectNamespace,
): Promise<Response> => {
  const id = match[1];
  const inner = new URL(request.url);
  inner.pathname = match[2] ?? "/";
  const stub = namespace.get(namespace.idFromName(id));
  return stub.fetch(new Request(inner, request));
};

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
    const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)(\/.*)?$/);
    if (sessionMatch) {
      return forward(request, sessionMatch, env.SESSION);
    }
    const walletMatch = url.pathname.match(/^\/wallets\/([^/]+)(\/.*)?$/);
    if (walletMatch) {
      return forward(request, walletMatch, env.WALLET);
    }
    return toResponse(request, env);
  },
};
