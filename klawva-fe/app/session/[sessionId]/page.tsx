'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { KlawvaMark } from '../../../components/icons/KlawvaMark';
import { PulseRing } from '../../../components/icons/PulseRing';
import { Button } from '../../../components/ui/Button';
import {
  activateSession,
  getSessionActivity,
  getSessionQR,
  getSessionStatus,
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
  const [sessionToken, setSessionToken] = useState<string>('');

  const [state, setState] = useState<HandshakeState>('provisioning');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Preparing your worker...');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrExpiresIn, setQrExpiresIn] = useState(60);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramOnboardingState, setTelegramOnboardingState] = useState<'pending' | 'linked' | 'intro_sent'>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const runHandshake = async () => {
      try {
        const token = sessionStorage.getItem(`klawva_session_token:${sessionId}`) || '';
        if (!token) {
          setErrorMessage('Session token missing. Please restart checkout.');
          return;
        }
        setSessionToken(token);
        setStatusText('Starting provisioning...');

        setProgress(30);
        setStatusText('Provisioning resources...');
        setProgress(55);
        setStatusText('Bootstrapping worker runtime...');
        setProgress(75);

        const activation = await activateSession(sessionId, token);
        if (cancelled) return;

        if (activation.qr) {
          setQrCode(activation.qr);
          setQrExpiresIn(activation.expiresIn || 60);
          setState('qr');
        }

        if (activation.telegramDeepLink || activation.telegramToken) {
          setTelegramDeepLink(activation.telegramDeepLink || null);
          setState('telegram');
        }

        setProgress(100);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to prepare this session.';
        if (message === 'payment_not_confirmed') {
          setErrorMessage('Payment is not confirmed yet. Complete payment and retry activation.');
        } else {
          setErrorMessage(message || 'Failed to prepare this session. Please retry from checkout.');
        }
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
          if (!sessionToken) return 0;
          void getSessionQR(sessionId, sessionToken)
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
  }, [sessionId, sessionToken, state]);

  useEffect(() => {
    if (channel !== 'telegram' || !sessionToken) return;
    let cancelled = false;

    const loadTelegramOnboardingState = async () => {
      try {
        const [sessionStatus, sessionActivity] = await Promise.all([
          getSessionStatus(sessionId, sessionToken),
          getSessionActivity(sessionId, sessionToken),
        ]);
        if (cancelled) return;

        const activityTexts = sessionActivity.activities.map((entry) => entry.text.toLowerCase());
        const introSent = activityTexts.some((text) => text.includes('intro message sent'));
        const linked = activityTexts.some((text) => text.includes('channel connected'));

        if (introSent) {
          setTelegramOnboardingState('intro_sent');
          return;
        }

        if (linked || sessionStatus.connected) {
          setTelegramOnboardingState('linked');
          return;
        }

        setTelegramOnboardingState('pending');
      } catch {
      }
    };

    void loadTelegramOnboardingState();
    const interval = setInterval(() => {
      void loadTelegramOnboardingState();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channel, sessionId, sessionToken]);

  const goToStatus = async () => {
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
            Connect your Telegram bot to begin receiving updates for this session.
          </p>

          <div className="font-mono text-xs text-klawva-dim mb-6">
            {telegramOnboardingState === 'intro_sent'
              ? 'Telegram onboarding: Intro sent'
              : telegramOnboardingState === 'linked'
                ? 'Telegram onboarding: Linked · Intro pending'
                : 'Telegram onboarding: Waiting for link confirmation'}
          </div>

          {telegramDeepLink ? (
            <a
              href={telegramDeepLink}
              target="_blank"
              rel="noreferrer"
              className="w-full mb-6"
            >
              <Button variant="secondary" size="lg" className="w-full">
                Open Telegram bot ↗
              </Button>
            </a>
          ) : (
            <div className="font-mono text-klawva-orange text-xs mb-6">
              Bot link is still preparing. Continue to session while provisioning finalizes.
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
