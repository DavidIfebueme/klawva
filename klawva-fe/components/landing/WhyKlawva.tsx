'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Card } from '../ui/Card';

const reasons = [
  {
    title: 'Destruction by Default',
    desc: 'No data stored. No profiles built. Session ends, everything is wiped. Your data is yours.',
  },
  {
    title: 'You hire a worker, not a tool',
    desc: "You don't need to learn anything. Describe the job. The worker figures it out and executes.",
  },
  {
    title: 'Costs less than lunch',
    desc: '₦2,500. No monthly commitment. Pay only when you need it. No hidden fees.',
  },
  {
    title: 'Lives where you already are',
    desc: 'WhatsApp or Telegram. No new app to download. No new dashboard to learn.',
  },
];

export function WhyKlawva() {
  return (
    <section id="why" className="py-32 px-6 bg-klawva-bg border-t border-klawva-border">
      <div className="max-w-7xl mx-auto">
        <div className="mb-24 text-center">
          <span className="font-mono text-klawva-dim text-sm tracking-[0.2em] uppercase">
            THE KLAWVA DIFFERENCE
          </span>
          <h2 className="font-syne font-extrabold text-4xl md:text-5xl lg:text-6xl text-klawva-text mt-4 tracking-tight">
            WHY KLAWVA
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {reasons.map((reason, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: 'easeOut' }}
            >
              <Card hover className="h-full p-8 md:p-12 flex flex-col justify-center">
                <h3 className="font-syne font-bold text-2xl text-klawva-text mb-4">
                  {reason.title}
                </h3>
                <p className="font-mono text-klawva-muted text-lg leading-relaxed">
                  {reason.desc}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
