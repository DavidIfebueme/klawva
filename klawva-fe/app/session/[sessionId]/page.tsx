'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { KlawvaMark } from '../../../components/icons/KlawvaMark';
import { PulseRing } from '../../../components/icons/PulseRing';
import { Button } from '../../../components/ui/Button';

type HandshakeState = 'provisioning' | 'qr' | 'telegram';

export default function SessionHandshakePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [state, setState] = useState<HandshakeState>('provisioning');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Provisioning server...');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrExpiresIn, setQrExpiresIn] = useState(20);
  const [isTelegram, setIsTelegram] = useState(false); // Mock channel type

  // Mock provisioning flow
  useEffect(() => {
    if (state !== 'provisioning') return;

    const statuses = [
      'Provisioning server...',
      'Loading agent config...',
      'Connecting to inference...',
      'Almost ready...',
    ];
    let statusIndex = 0;

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 80) return prev;
        return prev + Math.random() * 5;
      });
    }, 500);

    const statusInterval = setInterval(() => {
      statusIndex = (statusIndex + 1) % statuses.length;
      setStatusText(statuses[statusIndex]);
    }, 2000);

    const finishTimeout = setTimeout(() => {
      clearInterval(progressInterval);
      clearInterval(statusInterval);
      setProgress(100);
      
      // Randomly assign channel for mock purposes
      const channel = Math.random() > 0.5 ? 'whatsapp' : 'telegram';
      setIsTelegram(channel === 'telegram');
      
      if (channel === 'whatsapp') {
        setQrCode(`klawva-mock-qr-${Date.now()}`);
        setState('qr');
      } else {
        setState('telegram');
      }
    }, 6000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(statusInterval);
      clearTimeout(finishTimeout);
    };
  }, [state]);

  // Mock QR refresh flow
  useEffect(() => {
    if (state !== 'qr') return;

    const interval = setInterval(() => {
      setQrExpiresIn((prev) => {
        if (prev <= 1) {
          setQrCode(`klawva-mock-qr-${Date.now()}`);
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    // Mock successful scan after 10 seconds
    const scanTimeout = setTimeout(() => {
      router.push(`/session/${sessionId}/status`);
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(scanTimeout);
    };
  }, [state, sessionId, router]);

  // Mock Telegram redirect flow
  useEffect(() => {
    if (state !== 'telegram') return;

    const redirectTimeout = setTimeout(() => {
      router.push(`/session/${sessionId}/status`);
    }, 5000);

    return () => clearTimeout(redirectTimeout);
  }, [state, sessionId, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-klawva-bg px-6">
      
      {state === 'provisioning' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center text-center max-w-md w-full"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            className="mb-8"
          >
            <KlawvaMark size={64} />
          </motion.div>
          
          <h2 className="font-syne font-bold text-2xl text-klawva-text mb-2">Preparing your worker...</h2>
          <p className="font-mono text-klawva-muted text-sm mb-8 h-5">{statusText}</p>
          
          <div className="w-full h-1 bg-klawva-surface rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-klawva-accent"
              initial={{ width: '0%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}

      {state === 'qr' && qrCode && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-klawva-surface border border-klawva-border rounded-lg p-8 md:p-12 flex flex-col items-center text-center max-w-md w-full"
        >
          <h2 className="font-syne font-bold text-2xl text-klawva-text mb-8">Scan to connect</h2>
          
          <div className="bg-white p-4 rounded-lg mb-8 relative">
            <QRCodeSVG
              value={qrCode}
              size={240}
              bgColor="#FFFFFF"
              fgColor="#0A0A0A"
              level="H"
              includeMargin={false}
            />
            {qrExpiresIn === 20 && (
              <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0 bg-klawva-surface/80 backdrop-blur-sm flex items-center justify-center rounded-lg"
              >
                <div className="w-6 h-6 border-2 border-klawva-accent border-t-transparent rounded-full animate-spin" />
              </motion.div>
            )}
          </div>
          
          <p className="font-mono text-klawva-muted text-sm mb-6 max-w-xs">
            Open WhatsApp → tap the three dots → Linked Devices → Link a Device → Scan this code
          </p>
          
          <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider">
            QR expires in 0:{qrExpiresIn.toString().padStart(2, '0')}
          </div>
        </motion.div>
      )}

      {state === 'telegram' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-klawva-surface border border-klawva-border rounded-lg p-8 md:p-12 flex flex-col items-center text-center max-w-md w-full"
        >
          <PulseRing size={64} className="mb-8" />
          
          <h2 className="font-syne font-bold text-2xl text-klawva-text mb-4">Your agent is ready</h2>
          <p className="font-mono text-klawva-muted text-sm mb-8">
            Click the button below. Your Klawva agent will send you a message automatically.
          </p>
          
          <Button variant="primary" size="lg" className="w-full mb-6" href={`/session/${sessionId}/status`}>
            Open in Telegram →
          </Button>
          
          <div className="font-mono text-klawva-dim text-xs">
            Redirecting automatically...
          </div>
        </motion.div>
      )}

    </div>
  );
}
