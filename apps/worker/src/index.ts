import * as Effect from "effect/Effect";
import { toResponse } from "./adapter.ts";
import { make as makeDatabase } from "./db/database.ts";
import type { Env } from "./env.ts";
import { sweep } from "./lifecycle/lifecycle.ts";
import { handleInbound } from "./channels/email.ts";
import {
  handleDiscordInteraction,
  verifyDiscordSignature,
} from "./channels/discord.ts";
import {
  authorizeUrl,
  exchangeCode,
  handleEvent,
  saveConnection,
  verifySlackSignature,
} from "./channels/slack.ts";
import { handlePaystackWebhook } from "./payments/paystack.ts";
import { handleBreetWebhook } from "./payments/breet.ts";
import { signToken, verifyToken } from "./auth/tokens.ts";

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
    if (url.pathname === "/api/discord/interactions") {
      const rawBody = await request.text();
      const signature = request.headers.get("x-signature-ed25519") ?? "";
      const timestamp = request.headers.get("x-signature-timestamp") ?? "";
      const valid = await Effect.runPromise(
        verifyDiscordSignature(env.DISCORD_PUBLIC_KEY, signature, timestamp, rawBody),
      );
      if (!valid) {
        return Response.json({ error: "invalid signature" }, { status: 401 });
      }
      const body = await Effect.runPromise(
        handleDiscordInteraction(env, makeDatabase(env.DB), rawBody),
      );
      return new Response(body, {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/slack/install") {
      const session = url.searchParams.get("session") ?? "";
      const redirectUri = `${env.FRONTEND_BASE_URL}/api/slack/oauth`;
      const stateExit = await Effect.runPromiseExit(
        signToken(env.AUTH_SECRET, {
          email: "",
          exp: Math.floor(Date.now() / 1000) + 600,
          scope: "slack_oauth",
          sessionId: session,
        }),
      );
      if (stateExit._tag !== "Success") {
        return Response.redirect(
          `${env.FRONTEND_BASE_URL}/employees/launch?session=${session}&slack=failed`,
          302,
        );
      }
      return Response.redirect(
        authorizeUrl(env.SLACK_CLIENT_ID, redirectUri, stateExit.value),
        302,
      );
    }
    if (url.pathname === "/api/slack/oauth") {
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      const redirectUri = `${env.FRONTEND_BASE_URL}/api/slack/oauth`;
      const stateExit = await Effect.runPromiseExit(
        verifyToken(env.AUTH_SECRET, state),
      );
      if (
        stateExit._tag !== "Success" ||
        stateExit.value.scope !== "slack_oauth" ||
        stateExit.value.sessionId === undefined ||
        stateExit.value.sessionId.length === 0
      ) {
        return Response.redirect(
          `${env.FRONTEND_BASE_URL}/employees/launch?slack=failed`,
          302,
        );
      }
      const session = stateExit.value.sessionId;
      const install = await Effect.runPromise(
        exchangeCode(env.SLACK_CLIENT_ID, env.SLACK_CLIENT_SECRET, code, redirectUri),
      );
      if (install === null) {
        return Response.redirect(
          `${env.FRONTEND_BASE_URL}/employees/launch?session=${session}&slack=failed`,
          302,
        );
      }
      const db = makeDatabase(env.DB);
      const sessionRow = await Effect.runPromise(
        db
          .first("SELECT user_id AS userId FROM sessions WHERE id = ?", [session])
          .pipe(Effect.orDie),
      );
      if (sessionRow !== null && sessionRow.userId !== null) {
        await Effect.runPromise(
          saveConnection(db, String(sessionRow.userId), install),
        );
      }
      return Response.redirect(
        `${env.FRONTEND_BASE_URL}/employees/launch?session=${session}&slack=connected`,
        302,
      );
    }
    if (url.pathname === "/api/slack/events") {
      const rawBody = await request.text();
      const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
      const signature = request.headers.get("x-slack-signature") ?? "";
      const valid = await Effect.runPromise(
        verifySlackSignature(env.SLACK_SIGNING_SECRET, timestamp, rawBody, signature),
      );
      if (!valid) {
        return Response.json({ ok: false }, { status: 401 });
      }
      const challenge = await Effect.runPromise(
        handleEvent(env, makeDatabase(env.DB), rawBody),
      );
      return Response.json({ challenge });
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
    if (url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/webhooks/") ||
      url.pathname.startsWith("/internal/") ||
      url.pathname === "/health") {
      return toResponse(request, env);
    }
    return env.ASSETS.fetch(request);
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
