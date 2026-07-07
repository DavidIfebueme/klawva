'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { AgentActivityFeed } from './AgentActivityFeed';

export function Hero() {
  return (
    <section className="relative w-full h-screen overflow-hidden bg-klawva-bg">
      <AgentActivityFeed />

      <div className="absolute top-0 left-0 right-0 h-48 z-10 bg-gradient-to-b from-[#0A0A0A] to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-48 z-10 bg-gradient-to-t from-[#0A0A0A] to-transparent pointer-events-none" />

      <div className="relative z-20 flex flex-col items-center justify-center h-full text-center px-6 max-w-4xl mx-auto pt-16">
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
          className="mb-8"
        >
          <span className="font-mono text-klawva-muted text-xs tracking-[0.2em] uppercase">
            [ AUTONOMOUS · 24-HOUR · DISPOSABLE ]
          </span>
        </motion.div>

        <h1 className="font-syne font-extrabold text-5xl md:text-7xl lg:text-8xl leading-[0.9] tracking-tight mb-8">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5, ease: 'easeOut' }}
            className="text-klawva-text"
          >
            HIRE AN{' '}
            <span style={{ WebkitTextStroke: '2px #E8FF47', color: 'transparent' }}>
              AI EMPLOYEE
            </span>
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8, ease: 'easeOut' }}
          className="font-mono text-klawva-muted text-lg md:text-xl max-w-2xl mb-12"
        >
          Deploy an AI worker to your Telegram or WhatsApp. It handles the shift, delivers results, and signs off. One fee. No subscription.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.0, ease: 'easeOut' }}
          className="flex flex-col sm:flex-row items-center gap-4 mb-16"
        >
          <Button variant="primary" size="lg" href="#agents">Meet the Agents</Button>
          <Button variant="secondary" size="lg" href="#how-it-works">How It Works</Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.15, ease: 'easeOut' }}
          className="flex flex-wrap justify-center gap-3"
        >
          <Badge variant="pending" className="px-4 py-1.5 text-sm">SCRAPPER</Badge>
          <Badge variant="pending" className="px-4 py-1.5 text-sm">VENDOR</Badge>
          <Badge variant="pending" className="px-4 py-1.5 text-sm">RESEARCHER</Badge>
        </motion.div>

      </div>

      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </motion.div>

    </section>
  );
}
