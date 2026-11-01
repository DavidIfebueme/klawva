import { useMemo, useRef, useState } from "react";
import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/ui/Markdown";
import { toolActivity } from "@/lib/chat-activity";
import { getChatMessages, getSessionLaunch } from "@/lib/employees-api";
import { ApiError } from "@/lib/api-error.ts";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  if (params.sessionId === undefined) {
    throw redirect("/employees");
  }
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token === null) {
    throw redirect("/employees");
  }
  const [messages, meta] = await Promise.all([
    getChatMessages(params.sessionId, token),
    getSessionLaunch(params.sessionId, token).catch((cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 404) {
        return null;
      }
      throw cause;
    }),
  ]);
  if (meta === null) {
    throw redirect("/employees");
  }
  return {
    sessionId: params.sessionId,
    token,
    messages,
    employeeName: meta.agentName,
  };
};

interface Row {
  readonly key: string;
  readonly role: string;
  readonly content: string;
  readonly tools: ReadonlyArray<string>;
}

const toText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");

export function Component() {
  const { sessionId, token, messages: fallback, employeeName } =
    useLoaderData<typeof loader>();
  const agent = useAgent({
    agent: "session",
    name: sessionId,
    query: { token },
    ...(import.meta.env.VITE_AGENT_HOST === undefined
      ? {}
      : { host: import.meta.env.VITE_AGENT_HOST }),
  });
  const initialMessages = useMemo(
    () =>
      fallback.map((entry, index) => ({
        id: `fallback:${index}`,
        role: entry.role,
        parts: [{ type: "text" as const, text: entry.content }],
      })),
    [fallback],
  );
  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    connectionError,
    isServerStreaming,
    isRecovering,
  } = useAgentChat<unknown, UIMessage>({
    agent,
    getInitialMessages: async () => initialMessages,
  });
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState("");
  const pin = useRef({ count: -1, busy: false, lastLen: 0, tools: "" });

  const busy =
    status === "submitted" ||
    status === "streaming" ||
    isServerStreaming ||
    isRecovering;

  const rows = useMemo(() => {
    if (messages.length > 0) {
      const seenLive = new Set<string>();
      const live: Row[] = [];
      for (const message of messages) {
        const content = toText(message);
        const tools = toolActivity(message);
        if (content.length === 0 && tools.length === 0) continue;
        if (seenLive.has(message.id)) continue;
        seenLive.add(message.id);
        live.push({
          key: `live:${message.id}`,
          role: message.role,
          content,
          tools,
        });
      }
      return live;
    }
    const seenSeed = new Set<string>();
    const seeds: Row[] = [];
    for (const entry of fallback) {
      const fingerprint = `${entry.role}:${entry.content}`;
      if (seenSeed.has(fingerprint)) continue;
      seenSeed.add(fingerprint);
      seeds.push({ key: `seed:${fingerprint}`, ...entry, tools: [] });
    }
    return seeds;
  }, [fallback, messages]);

  const lastRow = rows.length === 0 ? null : rows[rows.length - 1];
  const lastHasTools = lastRow !== null && lastRow.tools.length > 0;
  const lastToolsKey = lastRow === null ? "" : lastRow.tools.join("|");

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (message.length === 0 || busy) {
      return;
    }
    setText("");
    setSendError("");
    sendMessage({ text: message }).catch((cause: unknown) => {
      setSendError(
        cause instanceof Error ? cause.message : "Message failed to send.",
      );
    });
  };

  const notice =
    connectionError !== null && connectionError !== undefined
      ? "Lost the connection to your employee. Reconnecting."
      : error !== null && error !== undefined
        ? error.message
        : sendError;

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <h1 className="font-syne font-bold text-2xl text-klawva-text">
              Chat with your employee
            </h1>
            <span
              className={`h-2 w-2 rounded-full ${busy ? "bg-klawva-accent animate-pulse" : "bg-klawva-dim"}`}
            />
          </div>
          <div className="bg-klawva-surface border border-klawva-border rounded-lg p-6 mb-6">
            <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
              {rows.length === 0 ? (
                <p className="font-mono text-klawva-muted text-sm">
                  Say hello to begin.
                </p>
              ) : (
                rows.map((row) => (
                  <div
                    key={row.key}
                    className={`flex ${row.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg border px-4 py-3 ${
                        row.role === "user"
                          ? "border-klawva-border bg-klawva-elevated"
                          : "border-klawva-border bg-klawva-surface"
                      }`}
                    >
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-klawva-dim">
                        {row.role === "user" ? "you" : employeeName}
                      </div>
                      {row.tools.length > 0 && (
                        <div className="mb-2 flex flex-col gap-1">
                          {row.tools.map((line, index) => (
                            <div
                              key={`${row.key}-tool-${index}`}
                              className="font-mono text-[11px] text-klawva-dim"
                            >
                              ▸ {line}
                            </div>
                          ))}
                        </div>
                      )}
                      <Markdown content={row.content} />
                    </div>
                  </div>
                ))
              )}
              {busy && !lastHasTools && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg border border-klawva-border bg-klawva-surface px-4 py-3">
                    <div className="font-mono text-klawva-dim text-xs animate-pulse">
                      thinking
                    </div>
                  </div>
                </div>
              )}
              <div
                ref={(el) => {
                  if (el === null) {
                    return;
                  }
                  const lastLen =
                    rows.length === 0 ? 0 : rows[rows.length - 1].content.length;
                  if (
                    rows.length === pin.current.count &&
                    busy === pin.current.busy &&
                    lastLen === pin.current.lastLen &&
                    lastToolsKey === pin.current.tools
                  ) {
                    return;
                  }
                  const first = pin.current.count === -1;
                  pin.current = { count: rows.length, busy, lastLen, tools: lastToolsKey };
                  if (!first) {
                    const scroller = el.parentElement;
                    if (scroller !== null) {
                      const gap =
                        scroller.scrollHeight -
                        scroller.scrollTop -
                        scroller.clientHeight;
                      if (gap > 160) {
                        return;
                      }
                    }
                  }
                  el.scrollIntoView({ block: "end" });
                }}
              />
            </div>
          </div>
          <form onSubmit={handleSend} className="flex gap-3">
            <input
              className="flex-grow h-12 bg-klawva-surface border border-klawva-border rounded px-4 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none font-mono"
              placeholder="Type a message"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            {busy ? (
              <Button type="button" variant="secondary" size="md" onClick={() => stop()}>
                Stop
              </Button>
            ) : (
              <Button type="submit" variant="primary" size="md">
                Send
              </Button>
            )}
          </form>
          {notice.length > 0 && (
            <p className="mt-4 text-xs text-klawva-orange font-mono">{notice}</p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
