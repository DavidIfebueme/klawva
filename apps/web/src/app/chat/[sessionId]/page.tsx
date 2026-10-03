import React, { useState } from "react";
import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { getChatMessages, sendChatMessage } from "@/lib/employees-api";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  if (params.sessionId === undefined) {
    throw redirect("/employees");
  }
  const messages = await getChatMessages(params.sessionId);
  return { sessionId: params.sessionId, messages };
};

interface Entry {
  role: string;
  content: string;
  createdAt: string;
}

export function Component() {
  const { sessionId, messages } = useLoaderData<typeof loader>();
  const [entries, setEntries] = useState<ReadonlyArray<Entry>>(messages);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (message.length === 0) return;
    setText("");
    setError("");
    setEntries((prev) => [
      ...prev,
      { role: "user", content: message, createdAt: new Date().toISOString() },
    ]);
    setBusy(true);
    try {
      const result = await sendChatMessage(sessionId, message);
      setEntries((prev) => [
        ...prev,
        { role: "assistant", content: result.reply, createdAt: new Date().toISOString() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="font-syne font-bold text-2xl text-klawva-text mb-6">
            Chat with your employee
          </h1>
          <div className="bg-klawva-surface border border-klawva-border rounded-lg p-6 min-h-[400px] mb-6 space-y-4">
            {entries.length === 0 ? (
              <p className="font-mono text-klawva-muted text-sm">
                Say hello to begin.
              </p>
            ) : (
              entries.map((entry, index) => (
                <div
                  key={index}
                  className={entry.role === "user" ? "text-right" : "text-left"}
                >
                  <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-1">
                    {entry.role}
                  </div>
                  <p className="font-mono text-klawva-text text-sm whitespace-pre-wrap inline-block text-left max-w-[85%]">
                    {entry.content}
                  </p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSend} className="flex gap-3">
            <input
              className="flex-grow h-12 bg-klawva-surface border border-klawva-border rounded px-4 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none font-mono"
              placeholder="Type a message"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit" variant="primary" size="md" loading={busy}>
              Send
            </Button>
          </form>
          {error && (
            <p className="mt-4 text-xs text-klawva-orange font-mono">{error}</p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
