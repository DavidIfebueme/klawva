'use client';

import React from 'react';
import { motion } from 'motion/react';

export function PulseRing({ size = 48, color = '#E8FF47', className = '' }: { size?: number; color?: string; className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {/* Center dot */}
      <div className="absolute rounded-full" style={{ width: 8, height: 8, backgroundColor: color }} />
      
      {/* Ring 1 */}
      <motion.div
        className="absolute rounded-full border-2"
        style={{ width: 16, height: 16, borderColor: color }}
        animate={{
          scale: [1, 3],
          opacity: [0.6, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      
      {/* Ring 2 */}
      <motion.div
        className="absolute rounded-full border-2"
        style={{ width: 16, height: 16, borderColor: color }}
        animate={{
          scale: [1, 3],
          opacity: [0.6, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "linear",
          delay: 1,
        }}
      />
    </div>
  );
}
