import React from 'react';
import Link from 'next/link';
import { KlawvaMark } from '../icons/KlawvaMark';
import { Button } from '../ui/Button';

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 w-full h-16 z-50 bg-klawva-bg/85 backdrop-blur-md border-b border-klawva-border">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <KlawvaMark size={28} />
          <span className="font-syne font-bold text-klawva-accent tracking-widest text-lg">KLAWVA</span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 mr-4">
            <Link href="/#agents" className="text-sm text-klawva-muted hover:text-klawva-text transition-colors">Agents</Link>
            <Link href="/#pricing" className="text-sm text-klawva-muted hover:text-klawva-text transition-colors">Pricing</Link>
            <Link href="/history" className="text-sm text-klawva-muted hover:text-klawva-text transition-colors">History</Link>
          </div>
          <Button variant="primary" size="sm" href="/#agents">Hire an Agent</Button>
        </div>
      </div>
    </nav>
  );
}
