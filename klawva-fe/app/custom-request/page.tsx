'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import { Button } from '../../components/ui/Button';
import { sendContactEmail } from '../../lib/api';

export default function CustomRequestPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeType, setEmployeeType] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() && email.trim() && description.trim().length >= 10 && !sending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSending(true);
    setError(null);
    setSent(false);

    try {
      await sendContactEmail({
        name: name.trim(),
        email: email.trim(),
        employeeType: employeeType.trim() || undefined,
        description: description.trim(),
      });
      setSent(true);
      setName('');
      setEmail('');
      setEmployeeType('');
      setDescription('');
    } catch {
      setError('Could not send request right now. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />

      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <span className="font-mono text-klawva-dim text-sm tracking-[0.2em] uppercase">
              CUSTOM REQUEST
            </span>
            <h1 className="font-syne font-extrabold text-4xl md:text-5xl text-klawva-text mt-4 mb-4 tracking-tight">
              Need a custom employee?
            </h1>
            <p className="font-mono text-klawva-muted text-lg mb-12">
              Describe the AI worker you need. We&apos;ll get back to you.
            </p>
          </motion.div>

          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
            className="bg-klawva-surface border border-klawva-border rounded-lg p-8 md:p-12 flex flex-col gap-6"
          >
            <div className="flex flex-col gap-2">
              <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                Name <span className="text-klawva-orange">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="bg-[#111111] border border-klawva-border rounded p-4 font-mono text-klawva-text text-sm focus:outline-none focus:border-klawva-accent transition-colors"
                required
                maxLength={100}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                Email <span className="text-klawva-orange">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-[#111111] border border-klawva-border rounded p-4 font-mono text-klawva-text text-sm focus:outline-none focus:border-klawva-accent transition-colors"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                What kind of employee?
              </label>
              <input
                type="text"
                value={employeeType}
                onChange={(e) => setEmployeeType(e.target.value)}
                placeholder="e.g. PM Assistant, Data Analyst, Customer Support"
                className="bg-[#111111] border border-klawva-border rounded p-4 font-mono text-klawva-text text-sm focus:outline-none focus:border-klawva-accent transition-colors"
                maxLength={100}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                Describe what you need <span className="text-klawva-orange">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us what this employee should do, what tools it needs, what channels it should work on..."
                className="bg-[#111111] border border-klawva-border rounded p-4 font-mono text-klawva-text text-sm focus:outline-none focus:border-klawva-accent transition-colors min-h-[160px] resize-y"
                required
                minLength={10}
                maxLength={2000}
              />
              <span className="font-mono text-klawva-dim text-xs">
                {description.length}/2000
              </span>
            </div>

            {error && (
              <div className="border border-klawva-orange rounded p-3 font-mono text-klawva-orange text-xs">
                {error}
              </div>
            )}

            {sent && (
              <div className="border border-klawva-accent rounded p-3 font-mono text-klawva-accent text-xs">
                Request sent. We&apos;ll contact you shortly.
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={sending}
              disabled={!canSubmit}
            >
              Submit request
            </Button>
          </motion.form>
        </div>
      </main>

      <Footer />
    </div>
  );
}
