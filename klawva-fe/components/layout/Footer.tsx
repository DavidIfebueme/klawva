import React from 'react';
import Link from 'next/link';
import { KlawvaMark } from '../icons/KlawvaMark';

export function Footer() {
  return (
    <footer className="bg-klawva-bg border-t border-klawva-border py-16 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <KlawvaMark size={24} />
            <span className="font-syne font-bold text-klawva-accent tracking-widest">KLAWVA</span>
          </div>
          <p className="text-klawva-muted text-sm max-w-xs">
            Hire autonomous AI workers for 24 hours. Pay once. It works. Then it disappears.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="font-syne font-bold text-klawva-text mb-2">Links</h4>
          <Link href="/#about" className="text-klawva-muted hover:text-klawva-accent text-sm transition-colors">About</Link>
          <Link href="/#agents" className="text-klawva-muted hover:text-klawva-accent text-sm transition-colors">Agents</Link>
          <Link href="/#pricing" className="text-klawva-muted hover:text-klawva-accent text-sm transition-colors">Pricing</Link>
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="font-syne font-bold text-klawva-text mb-2">Legal</h4>
          <Link href="/privacy" className="text-klawva-muted hover:text-klawva-accent text-sm transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="text-klawva-muted hover:text-klawva-accent text-sm transition-colors">Terms of Service</Link>
        </div>
      </div>
      <div className="max-w-7xl mx-auto pt-8 border-t border-klawva-border flex justify-between items-center">
        <p className="text-klawva-dim text-xs font-mono">
          © {new Date().getFullYear()} Klawva. Workers available 24/7.
        </p>
      </div>
    </footer>
  );
}
