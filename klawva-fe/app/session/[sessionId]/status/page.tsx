'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Navbar } from '../../../../components/layout/Navbar';
import { Footer } from '../../../../components/layout/Footer';
import { Badge } from '../../../../components/ui/Badge';
import { Countdown } from '../../../../components/ui/Countdown';
import { PulseRing } from '../../../../components/icons/PulseRing';
import { ScrapperIcon } from '../../../../components/icons/ScrapperIcon';
import { WhatsAppIcon } from '../../../../components/icons/WhatsAppIcon';
import { TelegramIcon } from '../../../../components/icons/TelegramIcon';
import { Button } from '../../../../components/ui/Button';

// Mock data
const mockSession = {
  agentId: 'scrapper',
  agentName: 'Klawva Scrapper',
  channel: 'whatsapp',
  endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  status: 'active',
};

const mockActivities = [
  { id: '1', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), text: 'Session started. Initializing parameters.' },
  { id: '2', timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(), text: 'Connected to WhatsApp successfully.' },
  { id: '3', timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(), text: 'Began monitoring target URLs.' },
];

export default function SessionStatusPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const router = useRouter();

  const [activities, setActivities] = useState(mockActivities);

  // Mock activity polling
  useEffect(() => {
    const interval = setInterval(() => {
      setActivities(prev => [
        {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          text: `Scanned ${Math.floor(Math.random() * 10) + 1} new pages. No changes detected.`,
        },
        ...prev,
      ]);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

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
                  <ScrapperIcon size={48} className="text-klawva-accent" />
                  <div>
                    <h1 className="font-syne font-bold text-2xl text-klawva-text mb-1">
                      {mockSession.agentName}
                    </h1>
                    <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider">
                      ID: {sessionId.substring(0, 8)}
                    </div>
                  </div>
                </div>
                
                <div className="relative">
                  <PulseRing size={40} className="absolute -top-2 -right-2" />
                  <Badge variant="active" className="relative z-10">ACTIVE</Badge>
                </div>
              </div>
              
              <div className="mb-8">
                <div className="font-mono text-klawva-muted text-xs uppercase tracking-wider mb-2">
                  Time Remaining
                </div>
                <Countdown endsAt={mockSession.endsAt} />
              </div>
              
              <div className="flex items-center gap-3 mb-8 bg-[#0A0A0A] border border-klawva-border rounded p-4">
                {mockSession.channel === 'whatsapp' ? (
                  <WhatsAppIcon size={20} className="text-klawva-accent" />
                ) : (
                  <TelegramIcon size={20} className="text-klawva-accent" />
                )}
                <span className="font-mono text-klawva-text text-sm">Connected</span>
              </div>
              
              <Button 
                variant="secondary" 
                className="w-full"
                href={`/report/${sessionId}`} // Mock link to report for testing
              >
                Message your agent →
              </Button>
            </div>
            
            <p className="font-mono text-klawva-dim text-xs text-center max-w-sm mx-auto">
              When your 24 hours are complete, your Mission Report will be delivered here and to your {mockSession.channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'}.
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
                activities.map((activity, i) => (
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
