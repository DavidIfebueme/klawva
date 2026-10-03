import React from 'react';

export function Card({ children, className = '', hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div
      className={`bg-klawva-surface border border-klawva-border rounded-lg p-6 transition-all duration-300 ${
        hover ? 'hover:border-klawva-accent hover:-translate-y-[2px]' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
