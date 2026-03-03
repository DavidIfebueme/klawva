'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { Navbar } from '../../../../components/layout/Navbar';
import { Footer } from '../../../../components/layout/Footer';
import { Badge } from '../../../../components/ui/Badge';
import { Countdown } from '../../../../components/ui/Countdown';
import { PulseRing } from '../../../../components/icons/PulseRing';
import { ScrapperIcon } from '../../../../components/icons/ScrapperIcon';
import { VendorIcon } from '../../../../components/icons/VendorIcon';
import { ResearcherIcon } from '../../../../components/icons/ResearcherIcon';
import { WhatsAppIcon } from '../../../../components/icons/WhatsAppIcon';
import { TelegramIcon } from '../../../../components/icons/TelegramIcon';
import { Button } from '../../../../components/ui/Button';
import { agents, AgentId } from '../../../../lib/agents';
import { getSessionActivity, getSessionStatus } from '../../../../lib/api';
import { ActivityEntry } from '../../../../types';

export default function SessionStatusPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const channel = searchParams.get('channel') === 'telegram' ? 'telegram' : 'whatsapp';
  const agentId = (searchParams.get('agent') as AgentId) || 'scrapper';
  const agent = agents[agentId] || agents.scrapper;
  const endsAt = searchParams.get('endsAt') || '';
  const AgentIcon =
    agent.id === 'vendor' ? VendorIcon : agent.id === 'researcher' ? ResearcherIcon : ScrapperIcon;

  const [status, setStatus] = useState<'provisioning' | 'ready' | 'active' | 'completed'>('provisioning');
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [channelLinked, setChannelLinked] = useState(false);
  const [introSent, setIntroSent] = useState(false);
  const [sessionToken] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(`klawva_session_token:${sessionId}`) || '';
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(
    sessionToken ? null : 'Session token missing. Please restart from checkout.',
  );

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;

    const loadSessionData = async () => {
      try {
        const [sessionStatus, sessionActivity] = await Promise.all([
          getSessionStatus(sessionId, sessionToken),
          getSessionActivity(sessionId, sessionToken),
        ]);
        if (cancelled) return;
        setStatus(sessionStatus.status);
        const orderedActivities = sessionActivity.activities.slice().reverse();
        const onboardingSignals = sessionActivity.activities.map((entry) => entry.text.toLowerCase());
        setChannelLinked(onboardingSignals.some((text) => text.includes('channel connected')));
        setIntroSent(onboardingSignals.some((text) => text.includes('intro message sent')));
        setActivities(orderedActivities);
        setErrorMessage(null);
      } catch {
        if (cancelled) return;
        setErrorMessage('Unable to load live session data.');
      }
    };

    void loadSessionData();
    const interval = setInterval(() => void loadSessionData(), 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, sessionToken]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">
          
          {/* Left Column: Session Info */}
          <div className="lg:col-span-5 flex flex-col gap-8">
            <div className="bg-klawva-surface border border-klawva-border rounded-lg p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <AgentIcon size={48} className="text-klawva-accent" />
                  <div>
                    <h1 className="font-syne font-bold text-2xl text-klawva-text mb-1">
                      {agent.name}
                    </h1>
                    <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider">
                      ID: {sessionId.substring(0, 8)}
                    </div>
                  </div>
                </div>
                
                <div className="relative">
                  <PulseRing size={40} className="absolute -top-2 -right-2" />
                  <Badge variant={status === 'completed' ? 'pending' : 'active'} className="relative z-10">
                    {status.toUpperCase()}
                  </Badge>
                </div>
              </div>
              
              <div className="mb-8">
                <div className="font-mono text-klawva-muted text-xs uppercase tracking-wider mb-2">
                  Time Remaining
                </div>
                {endsAt ? <Countdown endsAt={endsAt} /> : <div className="font-mono text-klawva-dim text-sm">24-hour session</div>}
              </div>
              
              <div className="flex items-center gap-3 mb-8 bg-[#0A0A0A] border border-klawva-border rounded p-4">
                {channel === 'whatsapp' ? (
                  <WhatsAppIcon size={20} className="text-klawva-accent" />
                ) : (
                  <TelegramIcon size={20} className="text-klawva-accent" />
                )}
                <span className="font-mono text-klawva-text text-sm">
                  {introSent ? 'Connected · Intro sent' : channelLinked ? 'Connected · Intro pending' : 'Connection pending'}
                </span>
              </div>
              
              <Button 
                variant="secondary" 
                className="w-full"
                href={`/report/${sessionId}?agent=${agent.id}&channel=${channel}`}
              >
                View mission report →
              </Button>
            </div>

            {errorMessage && (
              <div className="border border-klawva-orange rounded p-3 font-mono text-klawva-orange text-xs">
                {errorMessage}
              </div>
            )}
            
            <p className="font-mono text-klawva-dim text-xs text-center max-w-sm mx-auto">
              When your 24 hours are complete, your Mission Report appears here. It is also sent to your connected {channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'} once delivery completes.
            </p>
          </div>
          
          {/* Right Column: Activity Feed */}
          <div className="lg:col-span-7">
            <h2 className="font-syne font-bold text-2xl text-klawva-text mb-8 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-klawva-accent animate-pulse" />
              Live Activity
            </h2>
            
            <div className="flex flex-col gap-4">
              {activities.length === 0 ? (
                <div className="font-mono text-klawva-dim text-sm italic">
                  Your worker has started. Activity will appear here.
                </div>
              ) : (
                activities.map((activity) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex gap-4 p-4 border-l-2 border-klawva-border hover:border-klawva-accent transition-colors bg-klawva-surface/50"
                  >
                    <div className="font-mono text-klawva-dim text-xs whitespace-nowrap pt-1">
                      {formatTime(activity.timestamp)}
                    </div>
                    <div className="font-mono text-klawva-muted text-sm leading-relaxed">
                      {activity.text}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
          
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
