
import React from 'react';
import { motion } from 'motion/react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

const durations = ['24 hours', '2 days', '7 days', '30 days'];

const included = [
  'One shift at the length you pick',
  'AI budget for the shift',
  'Transcript in your account',
  'Shift report at the end',
];

export function Pricing({ minPriceMinor }: { minPriceMinor: number | null }) {
  return (
    <section id="pricing" className="py-32 px-6 bg-klawva-bg border-t border-klawva-border">
      <div className="max-w-3xl mx-auto text-center">
        <div className="mb-16">
          <span className="font-mono text-klawva-dim text-sm tracking-[0.2em] uppercase">
            PRICING
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
              <h3 className="font-syne font-extrabold text-6xl text-klawva-accent mb-4">
                {minPriceMinor === null
                  ? "One charge"
                  : `from ₦${(minPriceMinor / 100).toLocaleString()}`}
              </h3>
              <p className="font-mono text-klawva-muted text-sm mb-8">
                {minPriceMinor === null
                  ? "per shift, priced per employee"
                  : "for a 24-hour shift"}
              </p>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-wrap justify-center gap-3 mb-8"
        >
          {durations.map((duration) => (
            <span
              key={duration}
              className="font-mono text-klawva-dim text-xs px-3 py-1 border border-klawva-border rounded-full"
            >
              [ {duration} ]
            </span>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="font-mono text-klawva-muted text-sm mb-12"
        >
          Longer shifts cost less per day. One charge through Paystack.
        </motion.p>

        <motion.ul
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-xl mx-auto mb-16"
        >
          {included.map((item) => (
            <li key={item} className="font-mono text-klawva-muted text-sm flex items-start gap-3">
              <span className="text-klawva-accent">→</span>
              {item}
            </li>
          ))}
        </motion.ul>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button variant="primary" href="/employees">Browse employees</Button>
          <Button variant="secondary" href="/publish">Publish an employee</Button>
        </motion.div>
      </div>
    </section>
  );
}
