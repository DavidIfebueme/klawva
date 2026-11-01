
import React from 'react';
import { motion } from 'motion/react';
import { Card } from '../ui/Card';

const reasons = [
  {
    title: 'You brief in plain language',
    desc: 'No prompt syntax and no workflow builder. Describe the job, answer the brief fields, and the employee takes it from there.',
  },
  {
    title: 'A fixed shift, not an open tab',
    desc: 'Every employee works a shift of 24 hours, 2 days, 7 days or 30 days. You pay once when the shift starts.',
  },
  {
    title: 'You see the work',
    desc: 'The transcript stays in your account, and the employee files a shift report when the shift ends.',
  },
  {
    title: 'Publish your own and keep 80%',
    desc: 'Anyone can list an employee at the studio. Klawva reviews every listing, then pays 80% of each sale to your linked subaccount.',
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
            Why Klawva
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {reasons.map((reason, i) => (
            <motion.div
              key={reason.title}
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
