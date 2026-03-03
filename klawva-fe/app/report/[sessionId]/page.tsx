'use client';

import React, { useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import html2canvas from 'html2canvas';
import { Navbar } from '../../../components/layout/Navbar';
import { Footer } from '../../../components/layout/Footer';
import { KlawvaMark } from '../../../components/icons/KlawvaMark';
import { ScrapperIcon } from '../../../components/icons/ScrapperIcon';
import { VendorIcon } from '../../../components/icons/VendorIcon';
import { ResearcherIcon } from '../../../components/icons/ResearcherIcon';
import { Button } from '../../../components/ui/Button';
import { getSessionReport } from '../../../lib/api';
import { agents, AgentId } from '../../../lib/agents';

export default function MissionReportCardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const agentId = (searchParams.get('agent') as AgentId) || 'scrapper';
  const agent = agents[agentId] || agents.scrapper;
  const AgentIcon =
    agent.id === 'vendor' ? VendorIcon : agent.id === 'researcher' ? ResearcherIcon : ScrapperIcon;
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<{
    dateRange: string;
    stats: { label: string; value: string }[];
    summary: string;
  } | null>(null);
  const [sessionToken] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(`klawva_session_token:${sessionId}`) || '';
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(
    sessionToken ? null : 'Session token missing. Please restart from checkout.',
  );

  React.useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;

    const loadReport = async () => {
      try {
        const payload = await getSessionReport(sessionId, sessionToken);
        if (cancelled) return;
        setReport(payload);
        setErrorMessage(null);
      } catch {
        if (cancelled) return;
        setErrorMessage('Report is not available yet.');
      }
    };

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionToken]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0A0A0A',
        scale: 2, // High res
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `klawva-report-${sessionId.substring(0, 8)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to generate image', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      
      <main className="flex-grow pt-24 pb-32 px-6 flex flex-col items-center">
        <div className="w-full max-w-[640px]">
          
          {/* The Shareable Card */}
          <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="bg-klawva-surface border border-klawva-border rounded-lg overflow-hidden mb-8 shadow-2xl shadow-klawva-accent/5"
          >
            {/* Top Border Accent */}
            <div className="h-1 w-full bg-klawva-accent" />
            
            <div className="p-8 md:p-12">
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-3">
                  <KlawvaMark size={32} />
                  <span className="font-syne font-bold text-klawva-text tracking-widest">KLAWVA</span>
                </div>
                <div className="font-mono text-klawva-accent text-xs uppercase tracking-wider border border-klawva-accent px-3 py-1 rounded-full">
                  MISSION COMPLETE
                </div>
              </div>
              
              <div className="flex items-center gap-6 mb-8">
                  <AgentIcon size={64} className="text-klawva-text" />
                <div>
                  <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-klawva-text mb-2">
                    {agent.name}
                  </h1>
                  <div className="font-mono text-klawva-muted text-sm">
                    {report?.dateRange || 'Mission in progress'}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-12">
                {(report?.stats || []).map((stat, i) => (
                  <div key={i} className="bg-[#0A0A0A] border border-klawva-border rounded p-4 text-center">
                    <div className="font-syne font-bold text-2xl md:text-3xl text-klawva-accent mb-2">
                      {stat.value}
                    </div>
                    <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider leading-tight">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mb-12">
                <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-4">
                  Final Summary
                </div>
                <p className="font-mono text-klawva-text text-base leading-relaxed">
                  {report?.summary || 'Mission report is still compiling and will appear here after final delivery.'}
                </p>
              </div>
              
              <div className="flex items-center justify-between pt-8 border-t border-klawva-border">
                <div className="font-mono text-klawva-dim text-xs">
                  Powered by Klawva
                </div>
                <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider">
                  ID: {sessionId.substring(0, 8)}
                </div>
              </div>
            </div>
          </motion.div>

          {errorMessage && (
            <div className="mb-8 border border-klawva-orange rounded p-3 font-mono text-klawva-orange text-xs">
              {errorMessage}
            </div>
          )}
          
          {/* Actions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col gap-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button variant="secondary" onClick={handleShare}>
                {copied ? 'Copied!' : 'Share this report'}
              </Button>
              <Button variant="secondary" onClick={handleDownload}>
                Download as image
              </Button>
            </div>
            
            <div className="h-px w-full bg-klawva-border my-2" />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button variant="primary" href={`/hire/${agent.id}`}>
                Hire again →
              </Button>
              <Button variant="ghost" href="/">
                Try a different agent
              </Button>
            </div>
          </motion.div>
          
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
