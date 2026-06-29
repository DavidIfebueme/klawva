'use client';

import React, { useEffect, useState, use } from 'react';
import { useDashboardAuth } from '@/components/dashboard-auth-provider';
import { getDashboardSession, getDashboardSessionBrief, updateDashboardSessionBrief, toggleDashboardSessionAutoRenew } from '@/lib/api';
import { DashboardSessionEntry } from '@/types';
import { agents, AgentId } from '@/lib/agents';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Save, Bot, Calendar, ToggleLeft, ToggleRight, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'motion/react';

interface SessionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function SessionDetailPage({ params }: SessionDetailPageProps) {
  const { id } = use(params);
  const { token, loading: authLoading } = useDashboardAuth();
  const [session, setSession] = useState<DashboardSessionEntry | null>(null);
  const [brief, setBrief] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!token) return;

    async function loadSessionData() {
      try {
        const [sess, briefData] = await Promise.all([
          getDashboardSession(id, token!),
          getDashboardSessionBrief(id, token!),
        ]);
        setSession(sess);
        setBrief(briefData.brief || {});
      } catch (err) {
        console.error(err);
        setError('Failed to load session details.');
      } finally {
        setLoading(false);
      }
    }

    loadSessionData();
  }, [id, token]);

  const handleToggleAutoRenew = async () => {
    if (!token || !session) return;
    setToggling(true);
    try {
      const updated = await toggleDashboardSessionAutoRenew(session.id, !session.autoRenew, token);
      setSession((prev) => prev ? { ...prev, autoRenew: updated.autoRenew } : null);
    } catch (err) {
      console.error(err);
    } finally {
      setToggling(false);
    }
  };

  const handleBriefChange = (key: string, val: string) => {
    setBrief((prev) => ({ ...prev, [key]: val }));
  };

  const handleSaveBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !session) return;

    setSaving(true);
    setError('');
    setSaveSuccess(false);

    try {
      await updateDashboardSessionBrief(session.id, brief, token);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error(err);
      setError('Failed to update agent brief. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || (loading && !session)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-8 h-8 border-2 border-klawva-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-klawva-muted">LOADING SESSION PANEL...</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-6 text-center py-20 bg-klawva-surface border border-klawva-border rounded-lg max-w-lg mx-auto">
        <AlertTriangle className="text-klawva-orange w-12 h-12 mx-auto" />
        <h3 className="font-syne font-bold text-lg uppercase text-white">Session Not Found</h3>
        <p className="text-xs text-klawva-muted">This session either does not exist or does not belong to your account.</p>
        <Button variant="primary" size="sm" href="/dashboard">Back to Dashboard</Button>
      </div>
    );
  }

  const agentDef = agents[session.agentId as AgentId];
  const timeString = (isoString?: string) => {
    if (!isoString) return 'Pending';
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-8">
      {/* Back button */}
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-xs font-mono uppercase text-klawva-muted hover:text-klawva-accent transition-colors">
          <ArrowLeft size={14} />
          <span>Back to Deployments</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Worker Detail Summary */}
        <div className="bg-klawva-surface border border-klawva-border p-6 rounded-lg space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-klawva-accent border border-klawva-accent/20 px-2 py-0.5 rounded bg-klawva-accent/5">
                {session.status}
              </span>
              <span className="text-[10px] font-mono text-klawva-muted">
                ID: {session.id.substring(0, 8)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Bot size={24} className="text-klawva-accent" />
              <h3 className="font-syne font-extrabold text-xl uppercase text-white tracking-wider">
                {agentDef?.name || session.agentId}
              </h3>
            </div>
            <p className="text-xs text-klawva-muted leading-relaxed">
              {agentDef?.tagline || 'Autonomous artificial worker handling business tasks.'}
            </p>
          </div>

          <div className="divide-y divide-klawva-border border-t border-b border-klawva-border py-4 space-y-3">
            <div className="flex justify-between text-xs font-mono pt-1">
              <span className="text-klawva-muted">Channel:</span>
              <span className="text-klawva-text uppercase">{session.channel}</span>
            </div>
            <div className="flex justify-between text-xs font-mono pt-3">
              <span className="text-klawva-muted">Started:</span>
              <span className="text-klawva-text">{timeString(session.startedAt)}</span>
            </div>
            <div className="flex justify-between text-xs font-mono pt-3">
              <span className="text-klawva-muted">Expires:</span>
              <span className="text-klawva-text">{timeString(session.expiresAt)}</span>
            </div>
          </div>

          {/* Auto-renew Switch Panel */}
          <div className="bg-klawva-bg border border-klawva-border p-4 rounded flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white uppercase block">Auto-Renew Shift</span>
              <span className="text-[10px] text-klawva-muted font-mono">Deducts cost before expiry</span>
            </div>
            <button
              onClick={handleToggleAutoRenew}
              disabled={toggling}
              className={`w-10 h-6 rounded-full p-0.5 transition-colors relative flex items-center outline-none ${
                session.autoRenew ? 'bg-klawva-accent' : 'bg-klawva-border'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-klawva-bg shadow-sm transform transition-transform duration-200 ${
                  session.autoRenew ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* View Live Session status button */}
          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              href={`/session/${session.id}/status`}
              className="w-full flex items-center justify-center gap-2"
            >
              <span>View Onboarding & Live Status</span>
              <ExternalLink size={14} />
            </Button>
          </div>
        </div>

        {/* Right Column: Brief Editor Form */}
        <div className="lg:col-span-2 bg-klawva-surface border border-klawva-border p-6 rounded-lg space-y-6">
          <div>
            <span className="text-xs font-mono uppercase text-klawva-accent tracking-wider block mb-1">
              Active Fragment Direct Control
            </span>
            <h3 className="font-syne font-bold text-lg uppercase text-white">
              Worker Instructions Brief
            </h3>
            <p className="text-xs text-klawva-muted mt-1 leading-relaxed">
              Update the fields below to modify what your worker focuses on. Saves to this brief take effect **immediately** on the running agent workspace (rebuilding instructions file and reloading config).
            </p>
          </div>

          <form onSubmit={handleSaveBrief} className="space-y-6">
            {agentDef?.briefFields ? (
              <div className="space-y-5">
                {agentDef.briefFields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <label htmlFor={field.id} className="block text-xs uppercase tracking-wider text-klawva-muted">
                      {field.label} {field.required && <span className="text-klawva-accent">*</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        id={field.id}
                        required={field.required}
                        placeholder={field.placeholder}
                        value={brief[field.id] || ''}
                        onChange={(e) => handleBriefChange(field.id, e.target.value)}
                        rows={4}
                        className="w-full bg-klawva-bg border border-klawva-border rounded p-3 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono"
                        disabled={saving}
                      />
                    ) : (
                      <input
                        id={field.id}
                        type={field.type}
                        required={field.required}
                        placeholder={field.placeholder}
                        value={brief[field.id] || ''}
                        onChange={(e) => handleBriefChange(field.id, e.target.value)}
                        className="w-full h-11 bg-klawva-bg border border-klawva-border rounded px-3 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono"
                        disabled={saving}
                      />
                    )}
                    {field.hint && (
                      <span className="block text-[10px] text-klawva-muted font-mono leading-relaxed">
                        {field.hint}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="generic-brief" className="block text-xs uppercase tracking-wider text-klawva-muted">
                  Instruction Set JSON
                </label>
                <textarea
                  id="generic-brief"
                  rows={8}
                  value={JSON.stringify(brief, null, 2)}
                  onChange={(e) => {
                    try {
                      setBrief(JSON.parse(e.target.value));
                    } catch {}
                  }}
                  className="w-full bg-klawva-bg border border-klawva-border rounded p-3 text-xs font-mono text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors"
                  disabled={saving}
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-klawva-orange bg-klawva-orange/10 border border-klawva-orange/20 rounded p-3 font-mono">
                {error}
              </p>
            )}

            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded p-3 font-mono"
              >
                <CheckCircle2 size={16} />
                <span>Instructions saved successfully! Configuration reloaded on running agent.</span>
              </motion.div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={saving}
              className="flex items-center gap-2"
            >
              <Save size={16} />
              <span>Save & Reload Agent</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
