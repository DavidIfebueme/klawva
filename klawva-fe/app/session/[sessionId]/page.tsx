'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { KlawvaMark } from '../../../components/icons/KlawvaMark';
import { PulseRing } from '../../../components/icons/PulseRing';
import { Button } from '../../../components/ui/Button';
import {
  assignTelegramToken,
  bootstrapProvisioning,
  getSessionQR,
  ingestActivity,
  startProvisioning,
} from '../../../lib/api';

type HandshakeState = 'provisioning' | 'qr' | 'telegram';

export default function SessionHandshakePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const channel = searchParams.get('channel') === 'telegram' ? 'telegram' : 'whatsapp';
  const agent = searchParams.get('agent') || '';
  const endsAt = searchParams.get('endsAt') || '';

  const [state, setState] = useState<HandshakeState>('provisioning');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Preparing your worker...');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrExpiresIn, setQrExpiresIn] = useState(60);
  const [telegramToken, setTelegramToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const runHandshake = async () => {
      try {
        setStatusText('Starting provisioning...');
        await ingestActivity({
          sessionId,
          eventType: 'provisioning_started',
          text: 'Provisioning started from checkout handoff',
          payload: { source: 'frontend' },
        });

        setProgress(30);
        setStatusText('Provisioning resources...');

        try {
          await startProvisioning(sessionId);
        } catch {
        }

        setProgress(55);
        setStatusText('Bootstrapping worker runtime...');

        try {
          await bootstrapProvisioning(sessionId);
        } catch {
        }

        setProgress(75);

        if (channel === 'whatsapp') {
          const qr = await getSessionQR(sessionId);
          if (cancelled) return;
          setQrCode(qr.qr);
          setQrExpiresIn(qr.expiresIn);
          await ingestActivity({
            sessionId,
            eventType: 'channel_ready',
            text: 'WhatsApp QR generated',
            payload: { channel: 'whatsapp' },
          });
          setProgress(100);
          setState('qr');
          return;
        }

        const assigned = await assignTelegramToken(sessionId);
        if (cancelled) return;
        setTelegramToken(assigned.token);
        await ingestActivity({
          sessionId,
          eventType: 'channel_ready',
          text: 'Telegram token assigned',
          payload: { channel: 'telegram' },
        });
        setProgress(100);
        setState('telegram');
      } catch {
        if (cancelled) return;
        setErrorMessage('Failed to prepare this session. Please retry from checkout.');
      }
    };

    void runHandshake();

    return () => {
      cancelled = true;
    };
  }, [channel, sessionId]);

  useEffect(() => {
    if (state !== 'qr') return;

    const interval = setInterval(() => {
      setQrExpiresIn((prev) => {
        if (prev <= 1) {
          void getSessionQR(sessionId)
            .then((payload) => {
              setQrCode(payload.qr);
              setQrExpiresIn(payload.expiresIn);
            })
            .catch(() => {
            });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [sessionId, state]);

  const goToStatus = async () => {
    try {
      await ingestActivity({
        sessionId,
        eventType: 'bootstrap_completed',
        text: 'Handshake completed and worker activated',
        payload: { source: 'frontend' },
      });
    } catch {
    }

    const params = new URLSearchParams();
    if (channel) params.set('channel', channel);
    if (agent) params.set('agent', agent);
    if (endsAt) params.set('endsAt', endsAt);
    router.push(`/session/${sessionId}/status?${params.toString()}`);
  };

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

      {errorMessage && (
        <div className="mb-6 border border-klawva-orange rounded p-3 font-mono text-klawva-orange text-xs max-w-md w-full text-center">
          {errorMessage}
        </div>
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
          
          <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-6">
            QR expires in 0:{Math.max(qrExpiresIn, 0).toString().padStart(2, '0')}
          </div>

          <Button variant="primary" size="lg" className="w-full" onClick={goToStatus}>
            I scanned, continue →
          </Button>
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
            Telegram token assigned for this session.
          </p>

          {telegramToken && (
            <div className="font-mono text-klawva-dim text-xs break-all mb-6">
              {telegramToken}
            </div>
          )}
          
          <Button variant="primary" size="lg" className="w-full mb-6" onClick={goToStatus}>
            Continue to session →
          </Button>
        </motion.div>
      )}

    </div>
  );
}
