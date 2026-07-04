'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';

import { KlawvaMark } from '../../../components/icons/KlawvaMark';
import { PulseRing } from '../../../components/icons/PulseRing';
import { Button } from '../../../components/ui/Button';
import {
  activateSession,
  getSessionActivity,
  getSessionQR,
  getSessionStatus,
  getTelegramAuthBotId,
  lockTelegramAccess,
  lockWhatsAppAccess,
  submitTelegramAuth,
} from '../../../lib/api';

type HandshakeState = 'telegram-auth' | 'provisioning' | 'qr' | 'whatsapp-number' | 'telegram';

const PRIVACY_NOTICE = 'Your messages are processed by our AI during the session. After your shift ends, access is revoked and conversation logs are deleted.';

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
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const [waMeLink, setWaMeLink] = useState<string | null>(null);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramOnboardingState, setTelegramOnboardingState] = useState<'pending' | 'linked' | 'intro_sent'>('pending');
  const [whatsappOnboardingState, setWhatsappOnboardingState] = useState<'pending' | 'linked' | 'intro_sent'>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [telegramAuthError, setTelegramAuthError] = useState<string | null>(null);
  const [telegramAuthBotId, setTelegramAuthBotId] = useState<string | null>(null);
  const [telegramAuthLoading, setTelegramAuthLoading] = useState(false);

  const [provisioningReady, setProvisioningReady] = useState(false);
  const [shouldActivate, setShouldActivate] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem(`klawva_session_token:${sessionId}`) || '';
    if (!token) {
      setErrorMessage('Session token missing. Please restart checkout.');
      return;
    }
    setSessionToken(token);

    if (channel === 'telegram') {
      setState('telegram-auth');
      setStatusText('Connect your Telegram to secure this session.');
    } else {
      setState('provisioning');
      setStatusText('Activating your worker...');
      setProgress(20);
      setShouldActivate(true);
    }
  }, [channel, sessionId]);

  useEffect(() => {
    if (state !== 'telegram-auth') return;

    const scriptId = 'telegram-login-api-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.async = true;
      document.body.appendChild(script);
    }

    getTelegramAuthBotId()
      .then((data) => setTelegramAuthBotId(data.botId))
      .catch(() => setTelegramAuthError('Failed to load Telegram login. Please refresh.'));
  }, [state]);

  useEffect(() => {
    if (!shouldActivate || !sessionToken) return;
    let cancelled = false;

    const runActivation = async () => {
      let activation = null;
      const maxActivationAttempts = 30;

      for (let attempt = 0; attempt < maxActivationAttempts; attempt++) {
        if (cancelled) return;
        try {
          activation = await activateSession(sessionId, sessionToken);
          break;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : '';
          const isPending = errMsg === 'payment_not_confirmed' || errMsg === 'payment_not_initialized';

          if (isPending && attempt < maxActivationAttempts - 1) {
            setStatusText('Waiting for payment confirmation...');
            setProgress(20 + Math.min(30, attempt * 2));
            await new Promise((r) => setTimeout(r, 3000));
          } else {
            if (cancelled) return;
            setErrorMessage(errMsg || 'Failed to prepare this session. Please retry from checkout.');
            return;
          }
        }
      }

      if (!activation) return;
      if (cancelled) return;

      try {
        setProgress(60);
        setStatusText('Provisioning resources...');

        setProgress(80);

        if (channel === 'telegram' && (activation.telegramDeepLink || activation.telegramToken)) {
          setTelegramDeepLink(activation.telegramDeepLink || null);
          setProgress(100);
          setProvisioningReady(true);
        } else {
          if (activation.whatsappNumber) {
            setWhatsappNumber(activation.whatsappNumber);
            setWaMeLink(activation.waMeLink || null);
          }
          if (activation.qr) {
            setQrCode(activation.qr);
            setQrExpiresIn(activation.expiresIn || 60);
            setProvisioningReady(true);
          }

          setStatusText('Waiting for agent to come online...');

          const pollUntilReady = async () => {
            const maxAttempts = 120;
            for (let i = 0; i < maxAttempts; i++) {
              if (cancelled) return;
              await new Promise((r) => setTimeout(r, 3000));
              try {
                const [sessionStatus, sessionActivity] = await Promise.all([
                  getSessionStatus(sessionId, sessionToken),
                  getSessionActivity(sessionId, sessionToken),
                ]);
                const activityTexts = sessionActivity.activities.map((e) => e.text.toLowerCase());
                const connected = sessionStatus.connected
                  || activityTexts.some((t) => t.includes('channel connected'))
                  || activityTexts.some((t) => t.includes('intro message sent'));
                if (connected) {
                  if (cancelled) return;
                  setProgress(100);
                  setProvisioningReady(true);
                  return;
                }
              } catch {
              }
            }
            if (cancelled) return;
            setErrorMessage('Agent is taking too long to come online. Please try again.');
          };

          void pollUntilReady();
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : '';
        setErrorMessage(message || 'Failed to prepare this session. Please retry from checkout.');
      }
    };

    void runActivation();

    return () => {
      cancelled = true;
    };
  }, [shouldActivate, sessionToken, channel, sessionId]);

  const handleTelegramAuth = async (user: Record<string, unknown>) => {
    if (!sessionToken) {
      setTelegramAuthError('Session token missing. Please restart checkout.');
      return;
    }
    setTelegramAuthError(null);
    setState('provisioning');
    setStatusText('Securing your session...');
    setProgress(30);

    try {
      const response = await submitTelegramAuth(sessionId, sessionToken, {
        sessionId,
        user: user as {
          id: number;
          firstName?: string;
          lastName?: string;
          username?: string;
          photoUrl?: string;
          authDate: number;
          hash: string;
        },
      });
      if (!response.stored) {
        setTelegramAuthError('Telegram authentication failed. Please try again.');
        setState('telegram-auth');
        return;
      }
      setShouldActivate(true);
    } catch {
      setTelegramAuthError('Failed to secure session. Please try again.');
      setState('telegram-auth');
    }
  };

  const handleTelegramLoginClick = () => {
    if (!telegramAuthBotId) {
      setTelegramAuthError('Telegram login is not ready. Please refresh.');
      return;
    }
    const telegram = (window as unknown as {
      Telegram?: {
        Login?: {
          auth: (
            options: { bot_id: string; request_access: string },
            callback: (user: Record<string, unknown>) => void,
          ) => void;
        };
      };
    }).Telegram;
    if (!telegram?.Login?.auth) {
      setTelegramAuthError('Telegram login script is still loading. Please wait.');
      return;
    }
    setTelegramAuthLoading(true);
    telegram.Login.auth(
      { bot_id: telegramAuthBotId, request_access: 'write' },
      (user) => {
        setTelegramAuthLoading(false);
        void handleTelegramAuth(user);
      },
    );
  };

  useEffect(() => {
    if (!provisioningReady) return;
    if (whatsappNumber) {
      setState('whatsapp-number');
    } else if (qrCode) {
      setState('qr');
    } else if (telegramDeepLink) {
      setState('telegram');
    }
  }, [provisioningReady, whatsappNumber, qrCode, telegramDeepLink]);

  useEffect(() => {
    if (state !== 'qr') return;

    const interval = setInterval(() => {
      setQrExpiresIn((prev) => {
        if (prev <= 1) {
          if (!sessionToken) return 0;
          void getSessionQR(sessionId, sessionToken)
            .then((payload) => {
              if (payload.qr) {
                setQrCode(payload.qr);
                setQrExpiresIn(payload.expiresIn);
              }
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

  useEffect(() => {
    if (channel !== 'whatsapp' || !sessionToken) return;
    let cancelled = false;

    const loadWhatsAppOnboardingState = async () => {
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
          setWhatsappOnboardingState('intro_sent');
          return;
        }

        if (linked || sessionStatus.connected) {
          setWhatsappOnboardingState('linked');
          return;
        }

        setWhatsappOnboardingState('pending');
      } catch {
      }
    };

    void loadWhatsAppOnboardingState();
    const interval = setInterval(() => {
      void loadWhatsAppOnboardingState();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channel, sessionId, sessionToken]);

  useEffect(() => {
    if (channel !== 'telegram' || !sessionToken || telegramOnboardingState !== 'linked') return;
    void lockTelegramAccess(sessionId, sessionToken);
  }, [channel, sessionId, sessionToken, telegramOnboardingState]);

  useEffect(() => {
    if (channel !== 'whatsapp' || !sessionToken || whatsappOnboardingState !== 'linked') return;
    void lockWhatsAppAccess(sessionId, sessionToken);
  }, [channel, sessionId, sessionToken, whatsappOnboardingState]);

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

      {state === 'whatsapp-number' && whatsappNumber && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-klawva-surface border border-klawva-border rounded-lg p-8 md:p-12 flex flex-col items-center text-center max-w-md w-full"
        >
          <PulseRing size={64} className="mb-8" />

          <h2 className="font-syne font-bold text-2xl text-klawva-text mb-4">Your worker is ready</h2>
          <p className="font-mono text-klawva-muted text-sm mb-6">
            Send a message to your worker on WhatsApp to begin. Your session ID is already included.
          </p>

          <div className="bg-klawva-bg border border-klawva-border rounded-lg px-6 py-4 mb-6 w-full">
            <p className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-2">Worker number</p>
            <p className="font-syne font-bold text-xl text-klawva-text">{whatsappNumber}</p>
          </div>

          {waMeLink && (
            <a
              href={waMeLink}
              target="_blank"
              rel="noreferrer"
              className="w-full mb-6"
            >
              <Button variant="secondary" size="lg" className="w-full">
                Open WhatsApp ↗
              </Button>
            </a>
          )}

          <div className="font-mono text-xs text-klawva-dim mb-6">
            {whatsappOnboardingState === 'intro_sent'
              ? 'WhatsApp onboarding: Connected · Intro sent'
              : whatsappOnboardingState === 'linked'
                ? 'WhatsApp onboarding: Connected · Locking access...'
                : 'WhatsApp onboarding: Waiting for connection'}
          </div>

          {whatsappOnboardingState === 'intro_sent' && (
            <Button variant="primary" size="lg" className="w-full" onClick={goToStatus}>
              Continue to session →
            </Button>
          )}

          <p className="font-mono text-klawva-dim text-xs mt-6 max-w-xs">{PRIVACY_NOTICE}</p>
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
            <img src={qrCode} alt="WhatsApp QR code" className="w-60 h-60" />
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

          {channel === 'whatsapp' && (
            <div className="font-mono text-xs text-klawva-dim mb-6">
              {whatsappOnboardingState === 'intro_sent'
                ? 'WhatsApp onboarding: Connected · Intro sent'
                : whatsappOnboardingState === 'linked'
                  ? 'WhatsApp onboarding: Connected · Locking access...'
                  : 'WhatsApp onboarding: Waiting for connection'}
            </div>
          )}

          {channel === 'whatsapp' && whatsappOnboardingState === 'intro_sent' ? (
            <Button variant="primary" size="lg" className="w-full" onClick={goToStatus}>
              Continue to session →
            </Button>
          ) : (
            <Button variant="primary" size="lg" className="w-full" onClick={goToStatus}>
              I scanned, continue →
            </Button>
          )}

          <p className="font-mono text-klawva-dim text-xs mt-6 max-w-xs">{PRIVACY_NOTICE}</p>
        </motion.div>
      )}

      {state === 'telegram-auth' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-klawva-surface border border-klawva-border rounded-lg p-8 md:p-12 flex flex-col items-center text-center max-w-md w-full"
        >
          <PulseRing size={64} className="mb-8" />
          <h2 className="font-syne font-bold text-2xl text-klawva-text mb-4">Secure your session</h2>
          <p className="font-mono text-klawva-muted text-sm mb-8">
            Connect your Telegram account so only you can message this worker.
          </p>

          {telegramAuthBotId ? (
            <Button
              variant="primary"
              size="lg"
              className="w-full mb-6"
              loading={telegramAuthLoading}
              onClick={handleTelegramLoginClick}
            >
              Connect with Telegram
            </Button>
          ) : (
            <div className="font-mono text-klawva-orange text-xs mb-6 max-w-xs">
              Telegram login is not configured. Please contact support.
            </div>
          )}

          {telegramAuthError && (
            <div className="font-mono text-klawva-orange text-xs mb-6">
              {telegramAuthError}
            </div>
          )}

          <p className="font-mono text-klawva-dim text-xs mt-6 max-w-xs">{PRIVACY_NOTICE}</p>
        </motion.div>
      )}

      {state === 'telegram' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-klawva-surface border border-klawva-border rounded-lg p-8 md:p-12 flex flex-col items-center text-center max-w-md w-full"
        >
          <PulseRing size={64} className="mb-8" />
          
          {telegramOnboardingState === 'intro_sent' ? (
            <h2 className="font-syne font-bold text-2xl text-klawva-text mb-4">Your agent is ready</h2>
          ) : (
            <h2 className="font-syne font-bold text-2xl text-klawva-text mb-4">Connect your agent</h2>
          )}
          <p className="font-mono text-klawva-muted text-sm mb-8">
            {telegramOnboardingState === 'intro_sent'
              ? 'Your agent is online and ready. Open Telegram to start working.'
              : 'Open the Telegram bot link below and tap START to activate your agent. Your session ID is included automatically.'}
          </p>

          <div className="font-mono text-xs text-klawva-dim mb-6">
            {telegramOnboardingState === 'intro_sent'
              ? 'Telegram onboarding: Connected · Intro sent'
              : telegramOnboardingState === 'linked'
                ? 'Telegram onboarding: Connected · Waiting for intro...'
                : 'Telegram onboarding: Waiting for you to tap START'}
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
              Bot link is still preparing. Please wait...
            </div>
          )}
          
          {telegramOnboardingState === 'intro_sent' && (
            <Button variant="primary" size="lg" className="w-full mb-6" onClick={goToStatus}>
              Continue to session →
            </Button>
          )}
        </motion.div>
      )}

    </div>
  );
}
