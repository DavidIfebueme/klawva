import { useMemo, useSyncExternalStore } from "react";
import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import * as Schema from "effect/Schema";
import type { UIMessage } from "ai";
import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { getSessionLaunch } from "@/lib/employees-api";
import { toolActivity } from "@/lib/chat-activity";
import {
  desktopDownloadUrl,
  detectVisitorOs,
  downloadOsFor,
  unavailableOsCopy,
} from "@/lib/desktop-app";

const TaskHealthBody = Schema.Struct({
  health: Schema.optional(Schema.String),
});

const taskHealthStore = (() => {
  let health: string | null = null;
  let session: string | null = null;
  let token: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const subscribers = new Set<() => void>();
  const emit = () => subscribers.forEach((notify) => notify());
  const poll = async () => {
    if (session === null || token === null) return;
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(session)}/task`,
        { headers: { "x-auth-token": token } },
      );
      if (!response.ok) return;
      const body: unknown = await response.json();
      const decoded = Schema.decodeUnknownOption(TaskHealthBody)(body);
      const next = decoded._tag === "Some" ? (decoded.value.health ?? null) : null;
      if (next !== health) {
        health = next;
        emit();
      }
    } catch {
      return;
    }
  };
  return {
    retarget(nextSession: string, nextToken: string) {
      if (session === nextSession) return;
      session = nextSession;
      token = nextToken;
      health = null;
      emit();
    },
    subscribe(notify: () => void) {
      subscribers.add(notify);
      if (timer === null && subscribers.size === 1) {
        void poll();
        timer = setInterval(poll, 60_000);
      }
      return () => {
        subscribers.delete(notify);
        if (subscribers.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    snapshot: () => health,
  };
})();

function DesktopDownloadBlock({ agentName }: { readonly agentName: string }) {
  const visitor = useMemo(() => detectVisitorOs(navigator.userAgent), []);
  const os = downloadOsFor(visitor);
  const other = os === "windows" ? "linux" : "windows";
  return (
    <div className="text-left bg-klawva-surface border border-klawva-accent rounded-lg px-5 py-4 mb-8">
      <p className="font-mono text-klawva-dim text-[10px] uppercase tracking-wider mb-3">
        Runs on your computer
      </p>
      <p className="font-mono text-klawva-muted text-sm mb-4">
        {agentName} is a desktop employee. It only works through the klawva
        desktop app, so get that first.
      </p>
      {os === null ? (
        <p className="font-mono text-klawva-muted text-sm">
          {unavailableOsCopy(visitor)}
        </p>
      ) : (
        <>
          <div className="mb-2">
            <Button variant="primary" href={desktopDownloadUrl(os)}>
              download for {os}
            </Button>
          </div>
          <a
            href={desktopDownloadUrl(other)}
            className="text-xs text-klawva-muted underline font-mono"
          >
            download for {other} instead
          </a>
          <ol className="font-mono text-klawva-muted text-xs mt-4 space-y-1.5 list-decimal list-inside">
            <li>install the app and open it</li>
            <li>approve the pairing code it shows, right here on this site</li>
            <li>your employee starts working on your computer</li>
          </ol>
        </>
      )}
      <a
        href="/download"
        className="text-xs text-klawva-muted underline font-mono block mt-3"
      >
        all download options
      </a>
    </div>
  );
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const session = params.session ?? url.searchParams.get("session");
  const token = params.token ?? url.searchParams.get("token");
  if (session == null || token == null) {
    throw redirect("/employees");
  }
  const launch = await getSessionLaunch(session, token);
  return {
    session,
    token,
    botUsername: launch.telegramBotUsername,
    code: launch.code,
    channel: launch.channel,
    agentName: launch.agentName,
    customerEmail: launch.customerEmail,
    brief: launch.brief,
    desktop: launch.desktop === true,
  };
};

function TaskBanner({ session, token }: { readonly session: string; readonly token: string }) {
  useMemo(() => taskHealthStore.retarget(session, token), [session, token]);
  const health = useSyncExternalStore(taskHealthStore.subscribe, taskHealthStore.snapshot);

  if (health !== "degraded" && health !== "paused") return null;
  return (
    <div className="text-left bg-klawva-surface border border-klawva-accent rounded-lg px-5 py-3 mb-6 font-mono text-xs text-klawva-text">
      {health === "paused"
        ? "this employee has gone quiet. the shift is paused and we are checking on it."
        : "this employee has been quiet for a few minutes. it is still on shift."}
    </div>
  );
}

export function Component() {
  const { session, token, botUsername, code, channel, agentName, customerEmail, brief, desktop } =
    useLoaderData<typeof loader>();
  const link = `https://t.me/${botUsername}?start=${code}`;
  const chatLink = `/chat/${session}?token=${token}`;
  const slackLink = `/api/slack/install?session=${session}&token=${token}`;
  const briefEntries = Object.entries(brief).filter(
    ([, value]) => value.trim().length > 0,
  );
  const agent = useAgent({
    agent: "session",
    name: session,
    query: { token },
    ...(import.meta.env.VITE_AGENT_HOST === undefined
      ? {}
      : { host: import.meta.env.VITE_AGENT_HOST }),
  });
  const { messages, connectionError } = useAgentChat<unknown, UIMessage>({ agent });
  const activity = useMemo(() => {
    const lines: Array<{ key: string; kind: "tool" | "text"; text: string }> = [];
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "text" && message.role === "assistant") {
          const text = part.text.trim();
          if (text.length > 0) {
            lines.push({ key: `${message.id}-${lines.length}`, kind: "text", text });
          }
        } else if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
          const line = toolActivity({ ...message, parts: [part] })[0];
          if (line !== undefined) {
            lines.push({ key: `${message.id}-${lines.length}`, kind: "tool", text: line });
          }
        }
      }
    }
    return lines.slice(-8);
  }, [messages]);
  const isLive = connectionError === null || connectionError === undefined;

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-xl mx-auto text-center">
          <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-3">
            Payment complete
          </span>
          <TaskBanner session={session} token={token} />
          {briefEntries.length > 0 && (
            <div className="text-left bg-klawva-surface border border-klawva-border rounded-lg px-5 py-4 mb-6">
              <p className="font-mono text-klawva-dim text-[10px] uppercase tracking-wider mb-3">
                Your brief
              </p>
              <dl className="flex flex-col gap-2">
                {briefEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-mono text-klawva-dim text-xs capitalize">
                      {key.replace(/_/g, " ")}
                    </dt>
                    <dd className="font-mono text-klawva-text text-sm whitespace-pre-wrap">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {activity.length > 0 && (
            <div className="text-left bg-klawva-surface border border-klawva-border rounded-lg px-5 py-4 mb-10">
              <p className="font-mono text-klawva-dim text-[10px] uppercase tracking-wider mb-3">
                {isLive ? "Live now" : "Recent activity"}
              </p>
              <div className="flex flex-col gap-1.5">
                {activity.map((line) =>
                  line.kind === "tool" ? (
                    <div
                      key={line.key}
                      className="font-mono text-[11px] text-klawva-dim"
                    >
                      ▸ {line.text}
                    </div>
                  ) : (
                    <div
                      key={line.key}
                      className="font-mono text-sm text-klawva-text whitespace-pre-wrap"
                    >
                      {line.text}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
          {desktop && (
            <DesktopDownloadBlock agentName={agentName} />
          )}
          {channel === "web" ? (
            <>
              <h1 className="font-syne font-bold text-3xl text-klawva-text mb-4">
                Your employee is on it
              </h1>
              <p className="font-mono text-klawva-muted text-sm mb-10">
                {agentName} has your brief and is on shift for the next 24
                hours. Open the chat to watch it work or redirect it.
              </p>
              <div>
                <Button variant="primary" size="lg" href={chatLink}>
                  Watch it work
                </Button>
              </div>
            </>
          ) : channel === "email" ? (
            <>
              <h1 className="font-syne font-bold text-3xl text-klawva-text mb-4">
                Your employee is on it
              </h1>
              <p className="font-mono text-klawva-muted text-sm mb-10">
                {agentName} has your brief above and is already working. It will
                email you at{" "}
                {customerEmail.length > 0 ? customerEmail : "your address"} as it
                makes progress. Reply to that thread anytime to redirect it.
              </p>
              <div>
                <Button variant="primary" size="lg" href={chatLink}>
                  Watch it work
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-syne font-bold text-3xl text-klawva-text mb-4">
                Start your employee on Telegram
              </h1>
              <p className="font-mono text-klawva-muted text-sm mb-10">
                Scan the code or tap the button. This opens the bot and links it to
                your shift. Then just message it.
              </p>
              <div className="inline-block bg-white p-4 rounded-lg mb-8">
                <QRCodeSVG value={link} size={200} />
              </div>
              <div>
                <Button variant="primary" size="lg" href={link}>
                  Open Telegram
                </Button>
              </div>
            </>
          )}
          <p className="font-mono text-klawva-dim text-xs mt-8">
            {agentName} · 24-hour shift · channel: {channel}
          </p>
          {!desktop && (
            <p className="font-mono text-klawva-dim text-xs mt-6">
              Use a different channel instead
            </p>
          )}
          {channel !== "web" && (
            <p className="font-mono text-klawva-dim text-xs mt-2">
              <a href={chatLink} className="text-klawva-accent underline">
                Chat on the web
              </a>
            </p>
          )}
          {!desktop && channel !== "telegram" && (
            <p className="font-mono text-klawva-dim text-xs mt-2">
              <a href={link} className="text-klawva-accent underline">
                Open Telegram
              </a>
            </p>
          )}
          {!desktop && channel !== "email" && (
            <p className="font-mono text-klawva-dim text-xs mt-2">
              Prefer email? Your employee will email you. Reply to that thread
              from the address you paid with.
            </p>
          )}
          {!desktop && (
            <>
              <p className="font-mono text-klawva-dim text-xs mt-2">
                For teams:{" "}
                <a href={slackLink} className="text-klawva-accent underline">
                  Connect Slack
                </a>
              </p>
              <p className="font-mono text-klawva-dim text-xs mt-8 break-all">{link}</p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
