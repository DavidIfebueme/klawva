'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Card } from '../ui/Card';
import { useBillingProfile } from '@/hooks/use-billing-profile';
import { Button } from '../ui/Button';

export function Pricing() {
  const { profile } = useBillingProfile();

  return (
    <section id="pricing" className="py-32 px-6 bg-klawva-bg border-t border-klawva-border">
      <div className="max-w-3xl mx-auto text-center">
        <div className="mb-16">
          <span className="font-mono text-klawva-dim text-sm tracking-[0.2em] uppercase">
            ONE PRICE. ONE SHIFT.
          </span>
        </div>

        <div className="mb-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <Card className="h-full flex flex-col items-center justify-center p-12 hover:border-klawva-accent transition-colors duration-300">
              <h3 className="font-syne font-extrabold text-6xl text-klawva-accent mb-4">{profile.amountDisplay}</h3>
              <p className="font-mono text-klawva-muted text-sm mb-8">per 24-hour session</p>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-wrap justify-center gap-3 mb-16"
        >
          <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider px-3 py-1 border border-klawva-border rounded-full">
            [ Full 24-hour shift ]
          </span>
          <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider px-3 py-1 border border-klawva-border rounded-full">
            [ Mission Report Card ]
          </span>
          <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider px-3 py-1 border border-klawva-border rounded-full">
            [ Destruction by Default ]
          </span>
          <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider px-3 py-1 border border-klawva-border rounded-full">
            [ WhatsApp or Telegram ]
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-klawva-surface/50 border border-dashed border-klawva-border rounded-lg p-6 hover:border-klawva-accent/50 transition-colors duration-300"
        >
          <p className="font-mono text-klawva-muted text-sm mb-4">
            Need something custom? <strong className="text-klawva-text font-syne font-bold">Custom Klawva Employee</strong>.
          </p>
          <Button variant="secondary" href="/custom-request">Request one →</Button>
        </motion.div>
      </div>
    </section>
  );
}
