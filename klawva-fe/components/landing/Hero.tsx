'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

// Lazy load the 3D scene with SSR disabled
const DispatchScene = dynamic(() => import('../three/DispatchScene'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-klawva-bg" />,
});

export function Hero() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <section className="relative w-full h-screen overflow-hidden bg-klawva-bg">
      {/* 3D scene fills the entire background */}
      <div className="absolute inset-0 z-0">
        {!isMobile ? (
          <DispatchScene />
        ) : (
          <div className="w-full h-full bg-klawva-bg flex items-center justify-center">
            {/* Simplified mobile fallback could go here, for now just dark bg */}
            <div className="w-64 h-64 border border-klawva-accent/20 rounded-full animate-pulse blur-3xl" />
          </div>
        )}
      </div>

      {/* A subtle dark gradient overlay at the bottom — fades the scene into the next section smoothly */}
      <div className="absolute bottom-0 left-0 right-0 h-48 z-10 bg-gradient-to-t from-[#0A0A0A] to-transparent pointer-events-none" />

      {/* Text content sits above the scene */}
      <div className="relative z-20 flex flex-col items-center justify-center h-full text-center px-6 max-w-4xl mx-auto pt-16">
        
        {/* Badge */}
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

        {/* Headline */}
        <h1 className="font-syne font-extrabold text-5xl md:text-7xl lg:text-8xl leading-[0.9] tracking-tight mb-8 flex flex-col">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5, ease: 'easeOut' }}
            className="text-klawva-text"
          >
            HIRE THE WORKER.
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.65, ease: 'easeOut' }}
            style={{ WebkitTextStroke: '2px #E8FF47', color: 'transparent' }}
            className="my-2"
          >
            FIRE
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.65, ease: 'easeOut' }}
            className="text-klawva-text"
          >
            THE WORKER.
          </motion.span>
        </h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8, ease: 'easeOut' }}
          className="font-mono text-klawva-muted text-lg md:text-xl max-w-2xl mb-12"
        >
          Three autonomous AI agents. One flat fee. 24 hours. Then gone.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.0, ease: 'easeOut' }}
          className="flex flex-col sm:flex-row items-center gap-4 mb-16"
        >
          <Button variant="primary" size="lg" href="#agents">Meet the Agents</Button>
          <Button variant="secondary" size="lg" href="#how-it-works">How It Works</Button>
        </motion.div>

        {/* Agent pills */}
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

      {/* Scroll indicator */}
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
