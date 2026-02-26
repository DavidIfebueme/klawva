import React from 'react';

export function ScrapperIcon({ size = 48, color = '#E8FF47', className = '' }: { size?: number; color?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      {/* Crosshair lines */}
      <line x1="24" y1="4" x2="24" y2="44" />
      <line x1="4" y1="24" x2="44" y2="24" />
      
      {/* Center dot */}
      <circle cx="24" cy="24" r="1.5" fill={color} stroke="none" />
      
      {/* Lens offset to bottom-right */}
      <circle cx="32" cy="32" r="10" />
    </svg>
  );
}
