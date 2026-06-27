'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { agents, AgentId, Channel } from '../../lib/agents';
import { createSession } from '../../lib/api';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import { Button } from '../../components/ui/Button';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { TelegramIcon } from '../../components/icons/TelegramIcon';
import { ScrapperIcon } from '../../components/icons/ScrapperIcon';
import { VendorIcon } from '../../components/icons/VendorIcon';
import { ResearcherIcon } from '../../components/icons/ResearcherIcon';

const iconMap = {
  scrapper: ScrapperIcon,
  vendor: VendorIcon,
  researcher: ResearcherIcon,
};

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const agentId = searchParams.get('agent') as AgentId;
  const agent = agents[agentId];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [brief, setBrief] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState<Channel | null>(agent?.channels.length === 1 ? agent.channels[0] : null);
  const [customerEmail, setCustomerEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!agent) {
      router.push('/');
    }
  }, [agent, router]);

  if (!agent) return null;

  const Icon = iconMap[agent.id];

  const handleNextStep1 = () => {
    // Basic validation
    const missingRequired = agent.briefFields.filter(f => f.required && !brief[f.id]);
    if (missingRequired.length > 0) {
      alert(`Please fill in: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }
    
    if (agent.channels.length === 1) {
      setStep(3); // Skip channel selection if only 1 option
    } else {
      setStep(2);
    }
  };

  const handleNextStep2 = () => {
    if (!channel) {
      alert('Please select a channel');
      return;
    }
    setStep(3);
  };

  const handlePayment = async () => {
    if (!channel) {
      setErrorMessage('Please select a channel.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      // PAYWALL DISABLED — skip payment, create session directly
      const { sessionId, sessionToken } = await createSession({
        agentId: agent.id,
        channel,
        brief,
        customerEmail: customerEmail.trim() || undefined,
      });
      sessionStorage.setItem(`klawva_session_token:${sessionId}`, sessionToken);

      const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const params = new URLSearchParams({
        agent: agent.id,
        channel,
        endsAt,
      });
      router.push(`/session/${sessionId}?${params.toString()}`);
    } catch {
      setErrorMessage('Unable to start session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      
      {/* Step Indicator */}
      <div className="flex items-center justify-center mb-16">
        {[1, 2, 3].map((s, i) => (
          <React.Fragment key={s}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-syne font-bold text-sm ${
              step === s ? 'bg-klawva-accent text-klawva-bg' : 
              step > s ? 'bg-klawva-surface border border-klawva-accent text-klawva-accent' : 
              'bg-klawva-surface border border-klawva-border text-klawva-muted'
            }`}>
              {step > s ? '✓' : s}
            </div>
            {i < 2 && (
              <div className={`w-16 h-px mx-2 ${step > s ? 'bg-klawva-accent' : 'bg-klawva-border'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      <AnimatePresence mode="wait">
        
        {/* STEP 1: BRIEF */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-klawva-surface border border-klawva-border rounded-lg p-8 md:p-12"
          >
            <div className="flex items-center gap-4 mb-8">
              <Icon size={40} className="text-klawva-accent" />
              <h2 className="font-syne font-bold text-3xl text-klawva-text">The Brief</h2>
            </div>
            
            <div className="flex flex-col gap-8 mb-12">
              {agent.briefFields.map((field) => (
                <div key={field.id} className="flex flex-col gap-2">
                  <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                    {field.label} {field.required && <span className="text-klawva-orange">*</span>}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      className="bg-[#111111] border border-klawva-border rounded p-4 font-mono text-klawva-text text-sm focus:outline-none focus:border-klawva-accent transition-colors min-h-[120px] resize-y"
                      placeholder={field.placeholder}
                      value={brief[field.id] || ''}
                      onChange={(e) => setBrief({ ...brief, [field.id]: e.target.value })}
                    />
                  ) : (
                    <input
                      type={field.type}
                      className="bg-[#111111] border border-klawva-border rounded p-4 font-mono text-klawva-text text-sm focus:outline-none focus:border-klawva-accent transition-colors"
                      placeholder={field.placeholder}
                      value={brief[field.id] || ''}
                      onChange={(e) => setBrief({ ...brief, [field.id]: e.target.value })}
                    />
                  )}
                  {field.hint && (
                    <p className="font-mono text-klawva-dim text-xs mt-1">{field.hint}</p>
                  )}
                </div>
              ))}
            </div>
            
            <div className="flex justify-end">
              <Button variant="primary" onClick={handleNextStep1}>
                Next →
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP 2: CHANNEL */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-klawva-surface border border-klawva-border rounded-lg p-8 md:p-12"
          >
            <h2 className="font-syne font-bold text-3xl text-klawva-text mb-8">Select Channel</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
              <button
                disabled
                className="flex flex-col items-start text-left p-6 rounded-lg border bg-[#111111] border-klawva-border opacity-40 cursor-not-allowed"
              >
                <WhatsAppIcon size={48} className="text-klawva-muted mb-6" />
                <h3 className="font-syne font-bold text-xl text-klawva-text mb-2">WhatsApp</h3>
                <p className="font-mono text-klawva-muted text-sm mb-3">
                  Connect your agent via WhatsApp. You&apos;ll receive a number to message after checkout.
                </p>
                <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider">Coming soon</span>
              </button>
              
              <button
                onClick={() => setChannel('telegram')}
                className={`flex flex-col items-start text-left p-6 rounded-lg border transition-all duration-200 ${
                  channel === 'telegram' ? 'bg-[#1A1A1A] border-klawva-accent' : 'bg-[#111111] border-klawva-border hover:border-klawva-muted'
                }`}
              >
                <TelegramIcon size={48} className="text-klawva-accent mb-6" />
                <h3 className="font-syne font-bold text-xl text-klawva-text mb-2">Telegram</h3>
                <p className="font-mono text-klawva-muted text-sm">
                  You&apos;ll receive a bot link after payment confirmation. Open it to connect instantly.
                </p>
              </button>
            </div>
            
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button variant="primary" onClick={handleNextStep2}>
                Next →
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP 3: PAYMENT */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-klawva-surface border border-klawva-border rounded-lg p-8 md:p-12"
          >
            <h2 className="font-syne font-bold text-3xl text-klawva-text mb-8">Confirm & Launch</h2>
            
            <div className="bg-[#0A0A0A] border border-klawva-border rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-6 pb-6 border-b border-klawva-border">
                <div className="flex items-center gap-4">
                  <Icon size={32} className="text-klawva-accent" />
                  <div>
                    <div className="font-syne font-bold text-lg text-klawva-text">{agent.name}</div>
                    <div className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                      {channel}
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-2">Brief Summary</div>
                <p className="font-mono text-klawva-muted text-sm italic truncate">
                  &quot;{Object.values(brief)[0] || 'No brief provided'}&quot;
                </p>
              </div>
            </div>
            
            <div className="flex flex-col gap-4 mb-8">
              <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="Your email for shift updates and mission report"
                className="w-full bg-[#111111] border border-klawva-border rounded p-4 font-mono text-klawva-text text-sm focus:outline-none focus:border-klawva-accent transition-colors"
              />
              <p className="font-mono text-klawva-dim text-xs text-center">
                Your messages are processed by our AI during the session. After your shift ends, access is revoked and conversation logs are deleted.
              </p>
              {agent.comingSoon ? (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full opacity-40 cursor-not-allowed"
                  disabled
                >
                  Coming soon
                </Button>
              ) : (
                <Button 
                  variant="primary" 
                  size="lg" 
                  className="w-full"
                  onClick={handlePayment}
                  disabled={loading}
                >
                  {loading ? 'Launching...' : 'Launch session'}
                </Button>
              )}
            </div>

            {errorMessage && (
              <div className="mb-6 border border-klawva-orange rounded p-3 font-mono text-klawva-orange text-xs">
                {errorMessage}
              </div>
            )}
            
            <div className="mt-8 flex justify-start">
              <Button variant="ghost" onClick={() => setStep(agent.channels.length === 1 ? 1 : 2)} disabled={loading}>
                ← Back
              </Button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      
      <main className="flex-grow pt-24 pb-32 px-6">
        <Suspense fallback={<div className="text-center text-klawva-muted">Loading...</div>}>
          <CheckoutContent />
        </Suspense>
      </main>
      
      <Footer />
    </div>
  );
}
