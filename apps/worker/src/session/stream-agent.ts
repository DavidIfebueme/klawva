import * as Effect from "effect/Effect";
import {
  AIChatAgent,
  type ChatResponseResult,
  type OnChatMessageOptions,
} from "@cloudflare/ai-chat";
import type { Connection, ConnectionContext } from "agents";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type GenerateTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "../env.ts";
import { make as makeDatabase } from "../db/database.ts";
import {
  admitTurn,
  authorizeStream,
  budgetReply,
  capacityReply,
  completeShift,
  lastUserText,
  loadTurnConfig,
  makeStore,
  messageText,
  persistAssistant,
  sanitized,
  serveRestApi,
} from "./agent.ts";
import { recordAiUsage } from "../agent/meter.ts";
import { systemText } from "../agent/runtime.ts";
import { aiToolsFor } from "./stream-tools.ts";

export class SessionAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 400;
  private readonly settled = new Set<string>();
  private readonly admitted = new Set<string>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS session_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS session_messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)",
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/agents/")) {
      return super.fetch(request);
    }
    return serveRestApi(
      request,
      makeStore(this.ctx.storage.sql),
      this.env,
      String(this.ctx.id.name ?? ""),
    );
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const allowed = await Effect.runPromise(
      authorizeStream(
        this.env,
        makeDatabase(this.env.DB),
        this.name,
        url.searchParams.get("token"),
        ctx.request.headers.get("authorization") ??
          ctx.request.headers.get("x-auth-token"),
      ),
    ).catch(() => false);
    if (!allowed) {
      connection.close(4001, "Unauthorized");
    }
  }

  async onChatMessage(
    _onFinish: GenerateTextOnFinishCallback<ToolSet>,
    _options?: OnChatMessageOptions,
  ): Promise<Response | undefined> {
    const store = makeStore(this.ctx.storage.sql);
    const db = makeDatabase(this.env.DB);
    const sessionId = String(this.ctx.id.name ?? "");
    const text = lastUserText(this.messages);
    const keyed = `${sessionId}:${text}`;
    if (this.settled.has(keyed)) {
      return undefined;
    }
    this.settled.add(keyed);
    const admission = await Effect.runPromise(
      admitTurn(store, db, sessionId, text).pipe(
        Effect.catch(() => Effect.succeed({ _tag: "OutOfBudget" } as const)),
      ),
    );
    if (admission._tag === "Rejected") {
      return new Response(admission.reply, {
        headers: { "Content-Type": "text/plain" },
      });
    }
    if (admission._tag === "AtCapacity") {
      return new Response(capacityReply, {
        headers: { "Content-Type": "text/plain" },
      });
    }
    if (admission._tag === "OutOfBudget") {
      return new Response(budgetReply, {
        headers: { "Content-Type": "text/plain" },
      });
    }
    const config = admission.config;
    if (_options?.requestId !== undefined) {
      this.admitted.add(_options.requestId);
    }
    const workersai = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersai(config.model),
      system: systemText(config.soul, config.brief),
      messages: await convertToModelMessages(sanitized(this.messages)),
      tools: aiToolsFor(config.allowlist, sessionId),
      stopWhen: stepCountIs(4),
      abortSignal: _options?.abortSignal,
    });
    return result.toUIMessageStreamResponse();
  }

  async onChatResponse(result: ChatResponseResult): Promise<void> {
    const text = messageText(result.message);
    if (text.length === 0) {
      return;
    }
    const store = makeStore(this.ctx.storage.sql);
    const db = makeDatabase(this.env.DB);
    const admitted =
      result.requestId !== undefined && this.admitted.delete(result.requestId);
    const config = await Effect.runPromise(loadTurnConfig(store)).catch(
      () => null,
    );
    await Effect.runPromise(
      persistAssistant(store, db, this.name, text).pipe(
        Effect.andThen(() =>
          admitted && config !== null
            ? recordAiUsage(db, {
                model: config.model,
                inChars:
                  systemText(config.soul, config.brief).length +
                  this.messages.map(messageText).join("").length,
                outChars: text.length,
                ok: true,
              })
            : Effect.void,
        ),
      ),
    ).catch(() => undefined);
  }

  async alarm(): Promise<void> {
    await Effect.runPromise(
      completeShift(
        makeStore(this.ctx.storage.sql),
        this.env,
        String(this.ctx.id.name ?? ""),
      ),
    );
  }
}
