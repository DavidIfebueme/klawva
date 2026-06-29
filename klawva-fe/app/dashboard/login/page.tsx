'use client';

import React, { useState } from 'react';
import { requestDashboardMagicLink } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Mail, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError('');

    try {
      await requestDashboardMagicLink(email);
      setSent(true);
    } catch (err) {
      console.error(err);
      setError('Failed to send login link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-klawva-bg px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-klawva-surface border border-klawva-border p-8 rounded-lg"
      >
        <div className="mb-8 text-center">
          <span className="font-syne font-extrabold text-klawva-accent tracking-widest text-xs block mb-2">
            KLAWVA PORTAL
          </span>
          <h1 className="font-syne font-bold text-2xl text-white uppercase">
            Dashboard Login
          </h1>
          <p className="text-xs text-klawva-muted mt-2">
            Login seamlessly via secure magic link. No passwords required.
          </p>
        </div>

        {sent ? (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-6"
          >
            <div className="flex justify-center mb-4">
              <CheckCircle className="text-klawva-accent w-12 h-12 stroke-[1.5]" />
            </div>
            <h2 className="font-syne text-lg font-bold text-white uppercase mb-2">
              Check Your Inbox
            </h2>
            <p className="text-sm text-klawva-muted leading-relaxed">
              If an account is associated with <strong className="text-klawva-text">{email}</strong>, we have sent a secure magic link. Click the link to log in.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-6"
              onClick={() => setSent(false)}
            >
              Back to Login
            </Button>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                Email Address
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 bg-klawva-bg border border-klawva-border rounded px-4 pl-11 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono"
                  disabled={loading}
                />
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-klawva-dim w-4 h-4" />
              </div>
            </div>

            {error && (
              <p className="text-xs text-klawva-orange bg-klawva-orange/10 border border-klawva-orange/20 rounded p-3 font-mono">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full h-12 font-syne uppercase tracking-wider font-bold text-sm"
              loading={loading}
            >
              Send Login Link
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
