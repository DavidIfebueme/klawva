import * as Effect from "effect/Effect";
import { toResponse } from "./adapter.ts";
import { make as makeDatabase } from "./db/database.ts";
import type { Env } from "./env.ts";
import { sweep } from "./lifecycle/lifecycle.ts";
import { handleInbound } from "./channels/email.ts";
import { handlePaystackWebhook } from "./payments/paystack.ts";
import { handleBreetWebhook } from "./payments/breet.ts";

export { SessionAgent } from "./session/agent.ts";
export { WalletAgent } from "./wallet/wallet.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/internal/sweep") {
      const provided = request.headers.get("x-cron-secret") ?? "";
      if (env.CRON_SECRET.length === 0 || provided !== env.CRON_SECRET) {
        return Response.json({ ok: false }, { status: 401 });
      }
      const exit = await Effect.runPromiseExit(sweep(env));
      return exit._tag === "Success"
        ? Response.json(exit.value)
        : Response.json({ ok: false }, { status: 500 });
    }
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
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<void> {
    ctx.waitUntil(
      Effect.runPromise(sweep(env))
        .then(() => undefined)
        .catch(() => undefined),
    );
  },
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await Effect.runPromise(
      handleInbound(env, {
        from: message.from,
        to: message.to,
        rawSize: message.rawSize,
        raw: message.raw,
        setReject: (reason: string) => message.setReject(reason),
      }),
    );
  },
};
