'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Button } from '../ui/Button';

export function FinalCTA() {
  return (
    <section className="relative h-screen flex items-center justify-center px-6 bg-klawva-bg border-t border-klawva-border overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(232,255,71,0.08)_0%,transparent_60%)] pointer-events-none" />

      <div className="relative z-10 text-center max-w-3xl mx-auto flex flex-col items-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="font-syne font-extrabold text-5xl md:text-7xl lg:text-8xl text-klawva-text mb-6 tracking-tight leading-[0.9]"
        >
          YOUR FIRST WORKER IS WAITING.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          className="font-mono text-klawva-muted text-xl md:text-2xl mb-12"
        >
          Pick an agent. Brief them. Let them work.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4, ease: 'easeOut' }}
        >
          <Button variant="primary" size="lg" href="#agents" className="text-xl px-12 py-6">
            Hire Now →
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
