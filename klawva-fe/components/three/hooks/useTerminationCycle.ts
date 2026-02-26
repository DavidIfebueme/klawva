'use client';

import { useState, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export type TerminationPhase = 'idle' | 'fragmenting' | 'void' | 'reforming';

export function useTerminationCycle(
  isActive: boolean,
  onPhaseChange?: (phase: TerminationPhase) => void
) {
  const [phase, setPhase] = useState<TerminationPhase>('idle');
  const phaseRef = useRef<TerminationPhase>('idle');
  const timerRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // Sync state to ref for useFrame access
  useEffect(() => {
    phaseRef.current = phase;
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  // Trigger termination cycle
  useEffect(() => {
    if (!isActive) return;

    const triggerTermination = () => {
      setPhase('fragmenting');
      startTimeRef.current = performance.now();
    };

    // Random interval between 6-8 seconds
    const interval = Math.random() * 2000 + 6000;
    const timeout = setTimeout(triggerTermination, interval);

    return () => clearTimeout(timeout);
  }, [isActive, phase]);

  useFrame((state) => {
    if (phaseRef.current === 'idle') return;

    const now = performance.now();
    const elapsed = (now - startTimeRef.current) / 1000; // in seconds

    if (phaseRef.current === 'fragmenting') {
      if (elapsed >= 0.6) {
        setPhase('void');
        startTimeRef.current = now;
      }
    } else if (phaseRef.current === 'void') {
      if (elapsed >= 0.3) {
        setPhase('reforming');
        startTimeRef.current = now;
      }
    } else if (phaseRef.current === 'reforming') {
      if (elapsed >= 0.8) {
        setPhase('idle');
        // The useEffect will schedule the next termination
      }
    }
  });

  return { phase, phaseRef, startTimeRef };
}
