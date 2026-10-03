
import React, { useState } from 'react';
import Link from '@/components/ui/AppLink';
import { KlawvaMark } from '../icons/KlawvaMark';
import { Button } from '../ui/Button';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-klawva-bg/85 backdrop-blur-md border-b border-klawva-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <KlawvaMark size={28} />
          <span className="font-syne font-bold text-klawva-accent tracking-widest text-lg">KLAWVA</span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 mr-4">
            <Link href="/employees" className="text-sm text-klawva-muted hover:text-klawva-text transition-colors">Employees</Link>
            <Link href="/#pricing" className="text-sm text-klawva-muted hover:text-klawva-text transition-colors">Pricing</Link>
            <Link href="/studio/login" className="text-sm text-klawva-muted hover:text-klawva-text transition-colors font-bold text-klawva-accent">Studio</Link>
          </div>
          <div className="hidden md:block">
            <Button variant="primary" size="sm" href="/employees">Hire an Employee</Button>
          </div>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-klawva-text hover:text-klawva-accent focus:outline-none"
            aria-label="Toggle Menu"
          >
            {isOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="12" x2="20" y2="12"></line>
                <line x1="4" y1="6" x2="20" y2="6"></line>
                <line x1="4" y1="18" x2="20" y2="18"></line>
              </svg>
            )}
          </button>
        </div>
      </div>
      
      {isOpen && (
        <div className="md:hidden border-b border-klawva-border bg-klawva-bg/95 backdrop-blur-md px-6 py-6 flex flex-col gap-4">
          <Link
            href="/employees"
            onClick={() => setIsOpen(false)}
            className="text-lg text-klawva-muted hover:text-klawva-text transition-colors py-2 border-b border-klawva-border/50"
          >
            Employees
          </Link>
          <Link
            href="/#pricing"
            onClick={() => setIsOpen(false)}
            className="text-lg text-klawva-muted hover:text-klawva-text transition-colors py-2 border-b border-klawva-border/50"
          >
            Pricing
          </Link>
          <Link
            href="/studio/login"
            onClick={() => setIsOpen(false)}
            className="text-lg font-bold text-klawva-accent hover:text-klawva-text transition-colors py-2 border-b border-klawva-border/50"
          >
            Studio
          </Link>
          <div className="pt-4">
            <Button variant="primary" className="w-full justify-center" href="/employees" onClick={() => setIsOpen(false)}>
              Hire an Employee
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
