import React from 'react';

export function Badge({ children, variant = 'active', className = '' }: { children: React.ReactNode; variant?: 'active' | 'pending' | 'warning'; className?: string }) {
  const variants = {
    active: 'bg-klawva-accent text-klawva-bg border-transparent',
    pending: 'bg-klawva-elevated text-klawva-muted border-klawva-border',
    warning: 'bg-klawva-orange/15 text-klawva-orange border-klawva-orange/30',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
