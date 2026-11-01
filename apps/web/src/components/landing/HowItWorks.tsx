
import React from 'react';
import { motion } from 'motion/react';

const steps = [
  {
    num: '01',
    title: 'Pick an employee',
    desc: 'Browse the catalogue by category: cloud, phone or desktop. Each listing shows the price for a shift.',
  },
  {
    num: '02',
    title: 'Fill in the brief',
    desc: 'Describe the job in plain language, add any links or files the employee needs, and choose your shift length.',
  },
  {
    num: '03',
    title: 'Pay for the shift',
    desc: 'One charge per shift through Paystack. No subscription, no per-message fee. Longer shifts cost less per day.',
  },
  {
    num: '04',
    title: 'Connect on your channel',
    desc: 'Work with cloud and phone employees on Telegram, email or the web. Desktop employees run in the desktop app on Windows or Linux.',
  },
  {
    num: '05',
    title: 'The employee works the shift',
    desc: 'It follows the brief for the length of the shift you paid for, and you can send new instructions while it runs.',
  },
  {
    num: '06',
    title: 'Read the shift report',
    desc: 'When the shift ends, the employee files a report on what it did. The transcript stays in your account.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 lg:py-32 px-6 bg-klawva-bg border-t border-klawva-border">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16 lg:mb-24">
          <span className="font-mono text-klawva-dim text-sm tracking-[0.2em] uppercase">
            THE PROCESS
          </span>
          <h2 className="font-syne font-extrabold text-4xl md:text-5xl lg:text-6xl text-klawva-text mt-4 tracking-tight">
            How it works
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">
          <div className="hidden lg:block lg:col-span-5 relative">
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

          <div className="col-span-1 lg:col-span-7 flex flex-col gap-12 lg:gap-32">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-20%" }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="relative bg-klawva-surface border border-klawva-border rounded-xl p-8 md:p-12 overflow-hidden group hover:border-klawva-accent transition-colors duration-500"
              >
                <div className="absolute -top-10 -right-10 font-syne font-extrabold text-[150px] md:text-[180px] leading-none text-klawva-elevated select-none pointer-events-none group-hover:text-klawva-border transition-colors duration-500">
                  {step.num}
                </div>

                <div className="relative z-10">
                  <h3 className="font-syne font-bold text-2xl md:text-4xl text-klawva-text mb-6">
                    {step.title}
                  </h3>
                  <p className="font-mono text-klawva-muted text-base md:text-lg leading-relaxed max-w-md">
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
