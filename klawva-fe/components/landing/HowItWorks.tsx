'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { KlawvaMark } from '../icons/KlawvaMark';
import { useBillingProfile } from '@/hooks/use-billing-profile';

const baseSteps = [
  {
    num: '01',
    title: 'Choose your worker',
    desc: 'Select the agent that fits your mission: Scrapper, Vendor, or Researcher.',
  },
  {
    num: '02',
    title: 'Fill in the brief',
    desc: 'Give your agent clear instructions, context, and any necessary data or URLs.',
  },
  {
    num: '03',
    title: 'Pay the flat fee',
    desc: 'No subscriptions. No hidden costs. One price for a 24-hour shift.',
  },
  {
    num: '04',
    title: 'Scan or click to connect',
    desc: 'Connect via WhatsApp or Telegram. Your agent is ready immediately.',
    isQR: true,
  },
  {
    num: '05',
    title: 'Your worker gets to work',
    desc: 'The agent executes your brief autonomously for exactly 24 hours.',
  },
  {
    num: '06',
    title: 'Receive your Mission Report',
    desc: 'When the shift ends, the agent delivers a final report card and self-destructs.',
  },
];

export function HowItWorks() {
  const [isMobile, setIsMobile] = useState(false);
  const { profile } = useBillingProfile();

  const steps = baseSteps.map((step) =>
    step.num === '03'
      ? {
          ...step,
          desc: `${profile.amountDisplay} via ${profile.provider === 'paystack' ? 'Paystack' : 'Stripe'}. No subscriptions. No hidden costs. One price for a 24-hour shift.`,
        }
      : step,
  );

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <section id="how-it-works" className="py-32 px-6 bg-klawva-bg border-t border-klawva-border">
      <div className="max-w-7xl mx-auto">
        <div className="mb-24">
          <span className="font-mono text-klawva-dim text-sm tracking-[0.2em] uppercase">
            THE PROCESS
          </span>
          <h2 className="font-syne font-extrabold text-4xl md:text-5xl lg:text-6xl text-klawva-text mt-4 tracking-tight">
            HOW IT WORKS
          </h2>
        </div>

        <div className={`grid ${isMobile ? 'grid-cols-1 gap-12' : 'grid-cols-12 gap-24'}`}>
          {/* Left Column: Sticky List */}
          {!isMobile && (
            <div className="col-span-5 relative">
              <div className="sticky top-32 flex flex-col gap-6">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-4 group">
                    <span className="font-mono text-klawva-dim text-sm group-hover:text-klawva-accent transition-colors duration-300">
                      {step.num}
                    </span>
                    <span className="font-syne font-bold text-xl text-klawva-muted group-hover:text-klawva-text transition-colors duration-300">
                      {step.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Right Column: Scrolling Panels */}
          <div className={`${isMobile ? 'col-span-1' : 'col-span-7'} flex flex-col gap-16 md:gap-32`}>
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-20%" }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="relative bg-klawva-surface border border-klawva-border rounded-xl p-8 md:p-12 overflow-hidden group hover:border-klawva-accent transition-colors duration-500"
              >
                {/* Giant background number */}
                <div className="absolute -top-10 -right-10 font-syne font-extrabold text-[180px] leading-none text-klawva-elevated select-none pointer-events-none group-hover:text-klawva-border transition-colors duration-500">
                  {step.num}
                </div>

                <div className="relative z-10">
                  <h3 className="font-syne font-bold text-3xl md:text-4xl text-klawva-text mb-6">
                    {step.title}
                  </h3>
                  <p className="font-mono text-klawva-muted text-lg leading-relaxed max-w-md">
                    {step.desc}
                  </p>

                  {/* QR Mockup for Step 4 */}
                  {step.isQR && (
                    <div className="mt-12 w-full max-w-xs bg-klawva-bg border border-klawva-border rounded-lg p-6 flex flex-col items-center gap-6">
                      <KlawvaMark size={32} />
                      <div className="w-48 h-48 bg-klawva-surface border border-klawva-border rounded flex items-center justify-center relative overflow-hidden">
                        {/* Fake QR pattern */}
                        <div className="absolute inset-4 grid grid-cols-8 grid-rows-8 gap-1 opacity-50">
                          {Array.from({ length: 64 }).map((_, j) => (
                            <div
                              key={j}
                              className={`bg-klawva-accent rounded-sm ${((j * 17 + 13) % 100) > 50 ? 'opacity-100' : 'opacity-0'}`}
                            />
                          ))}
                        </div>
                        {/* QR Corners */}
                        <div className="absolute top-4 left-4 w-8 h-8 border-4 border-klawva-accent rounded-sm" />
                        <div className="absolute top-4 right-4 w-8 h-8 border-4 border-klawva-accent rounded-sm" />
                        <div className="absolute bottom-4 left-4 w-8 h-8 border-4 border-klawva-accent rounded-sm" />
                      </div>
                      <span className="font-mono text-klawva-muted text-xs uppercase tracking-widest">
                        Scan with WhatsApp
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
