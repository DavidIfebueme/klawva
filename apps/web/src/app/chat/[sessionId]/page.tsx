import { useMemo, useRef, useState } from "react";
import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/ui/Markdown";
import { getChatMessages, getSessionLaunch } from "@/lib/employees-api";

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
    getSessionLaunch(params.sessionId, token).catch(() => null),
  ]);
  if (meta === null) {
    throw redirect("/employees");
  }
  return {
    sessionId: params.sessionId,
    token,
    messages,
    brief: meta.brief,
    customerEmail: meta.customerEmail,
    agentSlug: meta.agentId,
  };
};

interface Row {
  readonly key: string;
  readonly role: string;
  readonly content: string;
}

const toText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");

const userPart = (
  brief: Readonly<Record<string, string>>,
  customerEmail: string,
): string => {
  for (const [key, value] of Object.entries(brief)) {
    const name = value.trim();
    if (key.toLowerCase().includes("name") && name.length > 0 && name.length <= 60) {
      return name;
    }
  }
  const at = customerEmail.indexOf("@");
  if (at > 0) {
    return customerEmail.slice(0, at);
  }
  if (customerEmail.trim().length > 0) {
    return customerEmail.trim();
  }
  return "you";
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

const employeeLabel = (user: string, agentSlug: string): string =>
  user === "you" ? `${agentSlug}_employee` : `${slugify(user)}_${agentSlug}_employee`;

export function Component() {
  const {
    sessionId,
    token,
    messages: fallback,
    brief,
    customerEmail,
    agentSlug,
  } = useLoaderData<typeof loader>();
  const agent = useAgent({
    agent: "session",
    name: sessionId,
    query: { token },
    ...(import.meta.env.VITE_AGENT_HOST === undefined
      ? {}
      : { host: import.meta.env.VITE_AGENT_HOST }),
  });
  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    connectionError,
    isServerStreaming,
    isRecovering,
  } = useAgentChat<unknown, UIMessage>({ agent });
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState("");
  const pin = useRef({ count: -1, busy: false });

  const busy =
    status === "submitted" ||
    status === "streaming" ||
    isServerStreaming ||
    isRecovering;

  const who = userPart(brief, customerEmail);
  const employee = employeeLabel(who, agentSlug);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const merged: Row[] = [];
    for (const entry of fallback) {
      const fingerprint = `${entry.role}:${entry.content}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      merged.push({ key: `seed:${fingerprint}`, ...entry });
    }
    for (const message of messages) {
      const content = toText(message);
      const fingerprint = `${message.role}:${content}`;
      if (content.length === 0 || seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      merged.push({
        key: `live:${message.id}`,
        role: message.role,
        content,
      });
    }
    return merged;
  }, [fallback, messages]);

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
                        {row.role === "user" ? who : employee}
                      </div>
                      <Markdown content={row.content} />
                    </div>
                  </div>
                ))
              )}
              {busy && (
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
                  if (
                    rows.length !== pin.current.count ||
                    busy !== pin.current.busy
                  ) {
                    pin.current = { count: rows.length, busy };
                    el.scrollIntoView({ block: "end" });
                  }
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
