'use client';

import React, { useEffect, useState } from 'react';
import { useDashboardAuth } from '@/components/dashboard-auth-provider';
import { getDashboardSessions, getDashboardWallet, toggleDashboardSessionAutoRenew } from '@/lib/api';
import { DashboardSessionEntry, WalletDetailsResponse } from '@/types';
import { Button } from '@/components/ui/Button';
import { ArrowRight, Bot, Clock, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'motion/react';

export default function DashboardPage() {
  const { token, loading: authLoading } = useDashboardAuth();
  const [sessions, setSessions] = useState<DashboardSessionEntry[]>([]);
  const [wallet, setWallet] = useState<WalletDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingMap, setTogglingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!token) return;

    async function loadData() {
      try {
        const [sessionList, walletInfo] = await Promise.all([
          getDashboardSessions(token!),
          getDashboardWallet(token!),
        ]);
        setSessions(sessionList);
        setWallet(walletInfo);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [token]);

  const handleToggleAutoRenew = async (id: string, currentVal: boolean) => {
    if (!token) return;
    setTogglingMap((prev) => ({ ...prev, [id]: true }));
    try {
      const updated = await toggleDashboardSessionAutoRenew(id, !currentVal, token);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, autoRenew: updated.autoRenew } : s))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingMap((prev) => ({ ...prev, [id]: false }));
    }
  };

  if (authLoading || (loading && !sessions.length)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-8 h-8 border-2 border-klawva-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-klawva-muted">LOADING DASHBOARD MODULE...</span>
      </div>
    );
  }

  const activeSessions = sessions.filter((s) => s.status !== 'completed');
  const pastSessions = sessions.filter((s) => s.status === 'completed');

  return (
    <div className="space-y-10">
      {/* Upper Panel: Overview & Wallet Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-klawva-surface border border-klawva-border p-6 rounded-lg flex flex-col justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-klawva-accent tracking-wider block mb-1">
              Active Shift Control Panel
            </span>
            <h2 className="font-syne font-bold text-xl uppercase text-white mb-2">
              Deployments Overview
            </h2>
            <p className="text-xs text-klawva-muted leading-relaxed max-w-xl">
              Monitor active worker shifts, control auto-renew configurations, and modify instructions live. Active shifts run for 24 hours and renew automatically if sufficient wallet balance is available.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-4">
            <Button variant="primary" size="sm" href="/#agents">
              Hire Another Worker
            </Button>
          </div>
        </div>

        <div className="bg-klawva-surface border border-klawva-border p-6 rounded-lg flex flex-col justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-klawva-muted tracking-wider block mb-1">
              Internal Funding Vault
            </span>
            <h2 className="font-syne font-bold text-xl uppercase text-white mb-2">
              Wallet Balance
            </h2>
            <div className="my-3">
              {wallet ? (
                <span className="text-3xl font-syne font-extrabold text-klawva-accent">
                  ₦{(wallet.balanceMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              ) : (
                <div className="h-9 w-32 bg-klawva-border animate-pulse rounded" />
              )}
            </div>
            {wallet && wallet.balanceMinor < 500000 && wallet.hasVirtualAccount && (
              <div className="flex items-start gap-2 bg-klawva-orange/10 border border-klawva-orange/20 rounded p-2 text-[10px] text-klawva-orange font-mono">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>Low balance. Fund your virtual account to ensure zero-downtime auto-renewals.</span>
              </div>
            )}
          </div>
          <div className="mt-4">
            <Button variant="secondary" size="sm" href="/dashboard/wallet" className="w-full">
              Manage Wallet
            </Button>
          </div>
        </div>
      </div>

      {/* Main Panel: Hired Workers */}
      <div className="space-y-6">
        <h3 className="font-syne font-bold text-lg uppercase text-white tracking-wider border-b border-klawva-border pb-3">
          Hired Workers ({sessions.length})
        </h3>

        {sessions.length === 0 ? (
          <div className="bg-klawva-surface border border-klawva-border rounded-lg p-12 text-center space-y-4">
            <Bot size={48} className="text-klawva-dim mx-auto" />
            <h4 className="font-syne text-md font-bold text-white uppercase">No workers hired</h4>
            <p className="text-xs text-klawva-muted max-w-sm mx-auto">
              Hire your first fully autonomous agent to get started. It will handle the shift and deliver results.
            </p>
            <Button variant="primary" size="sm" href="/#agents" className="mt-2">
              Explore AI Workers
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Deployments */}
            {activeSessions.length > 0 && (
              <div className="space-y-4">
                <span className="text-xs font-mono uppercase text-klawva-accent tracking-wider block">
                  Active Shifts ({activeSessions.length})
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeSessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onToggleAutoRenew={handleToggleAutoRenew}
                      toggling={togglingMap[session.id]}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Completed Deployments */}
            {pastSessions.length > 0 && (
              <div className="space-y-4">
                <span className="text-xs font-mono uppercase text-klawva-muted tracking-wider block">
                  Completed Shifts ({pastSessions.length})
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pastSessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onToggleAutoRenew={handleToggleAutoRenew}
                      toggling={togglingMap[session.id]}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  onToggleAutoRenew,
  toggling,
}: {
  session: DashboardSessionEntry;
  onToggleAutoRenew: (id: string, current: boolean) => void;
  toggling: boolean;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'ready':
        return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
      case 'provisioning':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      default:
        return 'text-klawva-muted bg-klawva-border/30 border-klawva-border';
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return 'Pending';
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <motion.div
      layout
      className="bg-klawva-surface border border-klawva-border rounded-lg p-5 flex flex-col justify-between hover:border-klawva-dim transition-colors"
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-klawva-accent" />
            <span className="font-syne font-extrabold uppercase text-white tracking-wider text-sm">
              {session.agentId}
            </span>
          </div>
          <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${getStatusColor(session.status)}`}>
            {session.status}
          </span>
        </div>

        {/* Content details */}
        <div className="space-y-1.5 text-xs text-klawva-muted font-mono">
          <div className="flex justify-between">
            <span>Channel:</span>
            <span className="text-klawva-text uppercase">{session.channel}</span>
          </div>
          <div className="flex justify-between">
            <span>Started:</span>
            <span className="text-klawva-text">{formatTime(session.startedAt)}</span>
          </div>
          {session.status === 'completed' ? (
            <div className="flex justify-between">
              <span>Finished:</span>
              <span className="text-klawva-text">{formatTime(session.completedAt)}</span>
            </div>
          ) : (
            <div className="flex justify-between">
              <span>Expires:</span>
              <span className="text-klawva-text">{formatTime(session.expiresAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer controls */}
      {session.status !== 'completed' && (
        <div className="mt-5 pt-4 border-t border-klawva-border flex items-center justify-between">
          {/* Auto-renew switch */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleAutoRenew(session.id, session.autoRenew)}
              disabled={toggling}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors relative flex items-center outline-none ${
                session.autoRenew ? 'bg-klawva-accent' : 'bg-klawva-border'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full bg-klawva-bg shadow-sm transform transition-transform duration-200 ${
                  session.autoRenew ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <div className="text-[10px] font-mono leading-none">
              <span className="block text-klawva-text font-bold">Auto-Renew</span>
              <span className="text-[9px] text-klawva-muted">24-hr extension</span>
            </div>
          </div>

          <Link
            href={`/dashboard/sessions/${session.id}`}
            className="flex items-center gap-1.5 text-xs text-klawva-accent uppercase tracking-wider font-syne font-bold hover:brightness-110"
          >
            <span>Manage</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {session.status === 'completed' && (
        <div className="mt-5 pt-4 border-t border-klawva-border flex justify-end">
          <Link
            href={`/report/${session.id}?agent=${session.agentId}`}
            className="flex items-center gap-1.5 text-xs text-klawva-accent uppercase tracking-wider font-syne font-bold hover:brightness-110"
          >
            <span>View Report</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </motion.div>
  );
}
