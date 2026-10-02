import React from 'react';

export function ResearcherIcon({ size = 48, color = '#E8FF47', className = '' }: { size?: number; color?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Three horizontal bars stacked */}
      <rect x="8" y="12" width="24" height="6" rx="2" />
      <rect x="8" y="24" width="32" height="6" rx="2" />
      <rect x="8" y="36" width="28" height="6" rx="2" />
      
      {/* Small arrow emerging from top-right of the top bar */}
      <polyline points="36,10 40,6 36,2" />
      <line x1="32" y1="14" x2="40" y2="6" />
    </svg>
  );
}
