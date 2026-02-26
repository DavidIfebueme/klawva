import React from 'react';

export function KlawvaMark({ size = 32, color = '#E8FF47', className = '' }: { size?: number; color?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      className={className}
    >
      <line x1="6" y1="8" x2="8" y2="18" />
      <line x1="11" y1="4" x2="13" y2="20" />
      <line x1="18" y1="6" x2="16" y2="16" />
    </svg>
  );
}
