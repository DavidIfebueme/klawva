'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Card } from '../ui/Card';

export function Pricing() {
  return (
    <section id="pricing" className="py-32 px-6 bg-klawva-bg border-t border-klawva-border">
      <div className="max-w-3xl mx-auto text-center">
        <div className="mb-16">
          <span className="font-mono text-klawva-dim text-sm tracking-[0.2em] uppercase">
            ONE PRICE. ONE SHIFT.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Nigeria Pricing */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <Card className="h-full flex flex-col items-center justify-center p-12 hover:border-klawva-accent transition-colors duration-300">
              <h3 className="font-syne font-extrabold text-6xl text-klawva-accent mb-4">₦2,500</h3>
              <p className="font-mono text-klawva-muted text-sm mb-8">per 24-hour session</p>
              
              <div className="flex items-center gap-2 text-klawva-dim font-mono text-xs uppercase tracking-wider mb-4">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                Paystack
              </div>
              <ul className="text-klawva-muted font-mono text-sm space-y-2">
                <li>Paid in Naira</li>
                <li>Bank Transfer, USSD, Card</li>
              </ul>
            </Card>
          </motion.div>

          {/* Global Pricing */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          >
            <Card className="h-full flex flex-col items-center justify-center p-12 hover:border-klawva-accent transition-colors duration-300">
              <h3 className="font-syne font-extrabold text-6xl text-klawva-accent mb-4">$1.99</h3>
              <p className="font-mono text-klawva-muted text-sm mb-8">per 24-hour session</p>
              
              <div className="flex items-center gap-2 text-klawva-dim font-mono text-xs uppercase tracking-wider mb-4">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                Stripe
              </div>
              <ul className="text-klawva-muted font-mono text-sm space-y-2">
                <li>USD · EUR · GBP accepted</li>
                <li>Credit/Debit Card, Apple Pay</li>
              </ul>
            </Card>
          </motion.div>
        </div>

        {/* Included pills */}
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

        {/* Custom Tier Teaser */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-klawva-surface/50 border border-dashed border-klawva-border rounded-lg p-6 hover:border-klawva-accent/50 transition-colors duration-300 cursor-pointer group"
        >
          <p className="font-mono text-klawva-muted text-sm">
            Need something custom? <strong className="text-klawva-text font-syne font-bold">Custom Klawva Employee</strong> — $30/day.{' '}
            <span className="text-klawva-accent group-hover:underline">[Get in touch →]</span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
