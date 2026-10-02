'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import { Button } from '../../components/ui/Button';
import { getHistorySessions, requestHistoryLink } from '../../lib/api';
import { agents, AgentId } from '../../lib/agents';
import { HistorySessionItem } from '../../types';

function HistoryContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [email, setEmail] = useState('');
  const [sessions, setSessions] = useState<HistorySessionItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadHistory = async () => {
      setLoading(true);
      try {
        const payload = await getHistorySessions(token);
        if (cancelled) return;
        setSessions(payload.sessions);
        setMessage(payload.sessions.length ? null : 'No sessions found for this email yet.');
      } catch {
        if (cancelled) return;
        setMessage('History link is invalid or expired. Request a new link below.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onRequestLink = async () => {
    if (!email.trim()) {
      setMessage('Enter your email address first.');
      return;
    }
    setLoading(true);
    try {
      await requestHistoryLink(email.trim());
      setMessage('History link sent. Check your inbox.');
    } catch {
      setMessage('Unable to send history link right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-grow pt-24 pb-20 px-6">
      <div className="max-w-3xl mx-auto">
          <h1 className="font-syne font-bold text-4xl text-klawva-text mb-4">Your Klawva History</h1>
          <p className="font-mono text-klawva-muted text-sm mb-8">
            Enter your payment email to receive a secure history link.
          </p>

          <div className="bg-klawva-surface border border-klawva-border rounded-lg p-6 mb-8">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full bg-[#111111] border border-klawva-border rounded p-4 font-mono text-klawva-text text-sm focus:outline-none focus:border-klawva-accent transition-colors mb-4"
            />
            <Button variant="primary" className="w-full" loading={loading} onClick={onRequestLink}>
              Send magic link
            </Button>
            {message && <p className="font-mono text-klawva-muted text-xs mt-4">{message}</p>}
          </div>

          {sessions.length > 0 && (
            <div className="flex flex-col gap-4">
              {sessions.map((session) => {
                const agent = agents[(session.agentId as AgentId) || 'scrapper'];
                return (
                  <div key={session.sessionId} className="bg-klawva-surface border border-klawva-border rounded-lg p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-syne font-bold text-xl text-klawva-text">{agent?.name || session.agentId}</h2>
                      <span className="font-mono text-xs uppercase text-klawva-accent">{session.status}</span>
                    </div>
                    <p className="font-mono text-klawva-muted text-xs mb-1">Channel: {session.channel}</p>
                    <p className="font-mono text-klawva-muted text-xs mb-1">
                      Start: {session.startedAt ? new Date(session.startedAt).toLocaleString() : 'N/A'}
                    </p>
                    <p className="font-mono text-klawva-muted text-xs">
                      End: {session.endsAt ? new Date(session.endsAt).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </main>
  );
}

export default function HistoryPage() {
  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <Suspense fallback={<div className="flex-grow pt-24 text-center text-klawva-muted">Loading...</div>}>
        <HistoryContent />
      </Suspense>
      <Footer />
    </div>
  );
}
