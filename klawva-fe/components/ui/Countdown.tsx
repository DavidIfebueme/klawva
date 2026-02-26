'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export function Countdown({ endsAt, className = '' }: { endsAt: string; className?: string }) {
  const [timeLeft, setTimeLeft] = useState({ h: '00', m: '00', s: '00' });
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const end = new Date(endsAt).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const distance = end - now;

      if (distance < 0) {
        setTimeLeft({ h: '00', m: '00', s: '00' });
        return;
      }

      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft({
        h: hours.toString().padStart(2, '0'),
        m: minutes.toString().padStart(2, '0'),
        s: seconds.toString().padStart(2, '0'),
      });

      setIsUrgent(distance < 1000 * 60 * 60); // Less than 1 hour
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  const color = isUrgent ? 'text-klawva-orange' : 'text-klawva-accent';

  return (
    <div className={`font-syne font-bold text-4xl flex items-center ${color} ${className}`}>
      <span>{timeLeft.h}</span>
      <motion.span
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="mx-1"
      >
        :
      </motion.span>
      <span>{timeLeft.m}</span>
      <motion.span
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="mx-1"
      >
        :
      </motion.span>
      <span>{timeLeft.s}</span>
    </div>
  );
}
