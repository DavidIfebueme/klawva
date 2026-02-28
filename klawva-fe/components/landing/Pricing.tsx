'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Card } from '../ui/Card';
import { useBillingProfile } from '@/hooks/use-billing-profile';
import { sendContactEmail } from '@/lib/api';
import { Button } from '../ui/Button';

export function Pricing() {
  const { profile } = useBillingProfile();
  const [email, setEmail] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCustomRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setSending(true);
    setError(null);
    setSent(false);

    try {
      await sendContactEmail({
        subject: 'Custom Klawva Employee request',
        body: [
          'A user requested a custom Klawva employee from the landing page.',
          '',
          `Reply email: ${email.trim()}`,
          `Billing profile shown: ${profile.provider} ${profile.amountDisplay}`,
        ].join('\n'),
        replyTo: email.trim(),
      });
      setSent(true);
      setEmail('');
    } catch {
      setError('Could not send request right now. Please try again.');
    } finally {
      setSending(false);
    }
  }

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

              <div className="flex items-center gap-2 text-klawva-dim font-mono text-xs uppercase tracking-wider mb-4">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                {profile.provider === 'paystack' ? 'Paystack' : 'Stripe'}
              </div>
              <ul className="text-klawva-muted font-mono text-sm space-y-2">
                {profile.provider === 'paystack' ? (
                  <>
                    <li>Paid in Naira</li>
                    <li>Bank Transfer, USSD, Card</li>
                  </>
                ) : (
                  <>
                    <li>USD · EUR · GBP accepted</li>
                    <li>Credit/Debit Card, Apple Pay</li>
                  </>
                )}
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
          className="bg-klawva-surface/50 border border-dashed border-klawva-border rounded-lg p-6 hover:border-klawva-accent/50 transition-colors duration-300"
        >
          <form onSubmit={handleCustomRequest} className="flex flex-col gap-3">
            <p className="font-mono text-klawva-muted text-sm text-left">
              Need something custom? <strong className="text-klawva-text font-syne font-bold">Custom Klawva Employee</strong> — $30/day.{' '}
              <span className="text-klawva-accent">[Get in touch →]</span>
            </p>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Your email address"
              className="w-full rounded border border-klawva-border bg-klawva-bg px-3 py-2 text-sm font-mono text-klawva-text outline-none focus:border-klawva-accent"
              required
            />
            <Button type="submit" variant="secondary" size="sm" loading={sending} className="w-full md:w-auto">
              Send request
            </Button>
            {sent && <p className="font-mono text-xs text-klawva-accent text-left">Request sent. We’ll contact you shortly.</p>}
            {error && <p className="font-mono text-xs text-klawva-muted text-left">{error}</p>}
          </form>
        </motion.div>
      </div>
    </section>
  );
}
