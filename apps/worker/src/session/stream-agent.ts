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
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "../env.ts";
import { make as makeDatabase } from "../db/database.ts";
import { bindTransport } from "./transports.ts";
import {
  admitTurn,
  streamIdentity,
  budgetReply,
  capacityReply,
  completeShift,
  dailyAiReply,
  lastUserText,
  loadTurnConfig,
  makeStore,
  messageText,
  type SessionStoreImpl,
  modelRetryReply,
  persistAssistant,
  retryTextFor,
  sanitized,
  serveRestApi,
  turnSucceeded,
} from "./agent.ts";
import {
  charsToTokens,
  quotaSpentRecently,
  recordAiUsage,
  recordQuotaSpent,
} from "../agent/meter.ts";
import { ModelError, systemText } from "../agent/runtime.ts";
import { neuronsSpent, resolveRuntime, bedrockEnabled } from "../agent/proxy.ts";
import { aiToolsFor } from "./stream-tools.ts";

interface TurnUsage {
  readonly inChars: number;
  readonly model: string;
  readonly steps: Array<{ readonly inTokens: number; readonly outTokens: number }>;
  failed: boolean;
}

const fallbackHistory = (messages: ReadonlyArray<UIMessage>) =>
  messages
    .slice(-20)
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: messageText(message),
    }))
    .filter((message) => message.content.length > 0);

export class SessionAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 400;
  private readonly settled = new Set<string>();
  private readonly turns = new Map<string, TurnUsage>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS session_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS session_messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)",
    );
  }

  private sessionStore(): SessionStoreImpl {
    const db = makeDatabase(this.env.DB);
    const sessionId = String(this.ctx.id.name ?? "");
    return makeStore(this.ctx.storage.sql, (spentMinor) => {
      this.ctx.waitUntil(
        Effect.runPromise(
          db
            .run("UPDATE sessions SET spent_minor = ?, updated_at = ? WHERE id = ?", [
              spentMinor,
              new Date().toISOString(),
              sessionId,
            ])
            .pipe(Effect.catch(() => Effect.void)),
        ),
      );
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/agents/")) {
      if (url.searchParams.get("__agents_transport") === "capnweb") {
        return new Response("hibernating transport only", { status: 400 });
      }
      return super.fetch(request);
    }
    return serveRestApi(
      request,
      this.sessionStore(),
      this.env,
      String(this.ctx.id.name ?? ""),
    );
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const db = makeDatabase(this.env.DB);
    const identity = await Effect.runPromise(
      streamIdentity(
        this.env,
        db,
        this.name,
        url.searchParams.get("token"),
        ctx.request.headers.get("authorization") ??
          ctx.request.headers.get("x-auth-token"),
      ),
    ).catch(() => null);
    if (identity === null) {
      connection.close(4001, "Unauthorized");
      return;
    }
    if (identity.kind === "device") {
      const bound = await Effect.runPromise(
        bindTransport(db, this.name, "desktop", "device", identity.deviceId).pipe(
          Effect.catch(() => Effect.succeed(false as const)),
          Effect.map(() => true as const),
        ),
      ).catch(() => false);
      if (!bound) {
        console.warn("desktop transport did not bind", identity.deviceId);
      }
    }
  }

  async onChatMessage(
    _onFinish: GenerateTextOnFinishCallback<ToolSet>,
    _options?: OnChatMessageOptions,
  ): Promise<Response | undefined> {
    const store = this.sessionStore();
    const db = makeDatabase(this.env.DB);
    const sessionId = String(this.ctx.id.name ?? "");
    const text = lastUserText(this.messages);
    const requestId = _options?.requestId;
    const keyed =
      requestId === undefined ? `${sessionId}:${text}` : `${sessionId}:${requestId}`;
    if (this.settled.has(keyed)) {
      return undefined;
    }
    this.settled.add(keyed);
    const quotaSpent = await Effect.runPromise(quotaSpentRecently(db));
    if (quotaSpent && !bedrockEnabled(this.env)) {
      return new Response(dailyAiReply, {
        headers: { "Content-Type": "text/plain" },
      });
    }
    const admission = await Effect.runPromise(
      admitTurn(store, db, sessionId, text, this.env.AI).pipe(
        Effect.catch(() => Effect.succeed({ _tag: "OutOfBudget" } as const)),
      ),
    );
    if (admission._tag === "Rejected") {
      return new Response(admission.reply, {
        headers: { "Content-Type": "text/plain" },
      });
    }
    if (admission._tag === "AwaitingPayment") {
      this.settled.delete(keyed);
      return new Response(admission.reply, {
        headers: { "Content-Type": "text/plain" },
      });
    }
    if (admission._tag === "ShiftOver") {
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
    if (quotaSpent) {
      const history = fallbackHistory(this.messages);
      const reply = await Effect.runPromise(
        resolveRuntime(this.env, db, config.model)
          .complete(history, false)
          .pipe(
            Effect.map((result) => result.text),
            Effect.catch(() => Effect.succeed(dailyAiReply)),
          ),
      );
      await Effect.runPromise(
        persistAssistant(store, db, this.name, reply),
      ).catch(() => undefined);
      return new Response(reply, {
        headers: { "Content-Type": "text/plain" },
      });
    }
    const inChars =
      systemText(config.soul, config.brief).length +
      this.messages.map(messageText).join("").length;
    const usage: TurnUsage = {
      inChars,
      model: config.model,
      steps: [],
      failed: false,
    };
    if (requestId !== undefined) {
      this.turns.set(requestId, usage);
    }
    const workersai = createWorkersAI({ binding: this.env.AI });
    const setup = await Effect.runPromise(
      Effect.result(
        Effect.tryPromise({
          try: async () => {
            const history = await convertToModelMessages(
              sanitized(this.messages),
            );
            const result = streamText({
              model: workersai(config.model),
              system: systemText(config.soul, config.brief),
              messages: history,
              tools: aiToolsFor(config.allowlist, sessionId, this.env.BRAVE_API_KEY ?? ""),
              stopWhen: stepCountIs(4),
              abortSignal: _options?.abortSignal,
              onStepFinish: (step) => {
                usage.steps.push({
                  inTokens: step.usage.inputTokens ?? 0,
                  outTokens: step.usage.outputTokens ?? 0,
                });
              },
            });
            return result.toUIMessageStreamResponse();
          },
          catch: (cause) => new ModelError({ cause }),
        }),
      ),
    );
    if (setup._tag === "Failure") {
      usage.failed = true;
      const spent = neuronsSpent(setup.failure);
      await Effect.runPromise(
        Effect.all([
          recordAiUsage(db, {
            model: config.model,
            inTokens: 0,
            outTokens: 0,
            ok: false,
          }),
          spent ? recordQuotaSpent(db) : Effect.void,
        ]),
      ).catch(() => undefined);
      return new Response(spent ? dailyAiReply : modelRetryReply, {
        headers: { "Content-Type": "text/plain" },
      });
    }
    return setup.success;
  }

  async onChatResponse(result: ChatResponseResult): Promise<void> {
    const text = messageText(result.message);
    const requestId = result.requestId;
    const usage =
      requestId === undefined ? undefined : this.turns.get(requestId);
    if (requestId !== undefined) {
      this.turns.delete(requestId);
    }
    const store = this.sessionStore();
    const db = makeDatabase(this.env.DB);
    if (
      result.status === "error" &&
      result.error !== undefined &&
      neuronsSpent(result.error)
    ) {
      await Effect.runPromise(recordQuotaSpent(db));
    }
    const retry = retryTextFor(result.status, text.length);
    if (retry !== null) {
      await Effect.runPromise(
        persistAssistant(store, db, this.name, retry),
      ).catch(() => undefined);
    } else if (text.length > 0) {
      await Effect.runPromise(
        persistAssistant(store, db, this.name, text),
      ).catch(() => undefined);
    }
    if (usage === undefined) {
      return;
    }
    const ok = turnSucceeded(result.status, usage.failed);
    const records =
      usage.steps.length > 0
        ? usage.steps
        : [
            {
              inTokens: charsToTokens(usage.inChars),
              outTokens: charsToTokens(text.length),
            },
          ];
    await Effect.runPromise(
      Effect.forEach(records, (step) =>
        recordAiUsage(db, {
          model: usage.model,
          inTokens: step.inTokens,
          outTokens: step.outTokens,
          ok,
        }),
      ),
    ).catch(() => undefined);
  }

  async alarm(): Promise<void> {
    await Effect.runPromise(
      completeShift(
        this.sessionStore(),
        this.env,
        String(this.ctx.id.name ?? ""),
      ),
    );
  }
}
