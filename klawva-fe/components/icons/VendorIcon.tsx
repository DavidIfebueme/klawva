import React from 'react';

export function VendorIcon({ size = 48, color = '#E8FF47', className = '' }: { size?: number; color?: string; className?: string }) {
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
      {/* 3x3 grid of squares, each square is 8x8 with 4px gap */}
      {/* Top row */}
      <rect x="8" y="8" width="8" height="8" />
      <rect x="20" y="8" width="8" height="8" />
      <rect x="32" y="8" width="8" height="8" fill={color} />
      
      {/* Middle row */}
      <rect x="8" y="20" width="8" height="8" />
      <rect x="20" y="20" width="8" height="8" fill={color} />
      <rect x="32" y="20" width="8" height="8" />
      
      {/* Bottom row */}
      <rect x="8" y="32" width="8" height="8" />
      <rect x="20" y="32" width="8" height="8" />
      <rect x="32" y="32" width="8" height="8" />
    </svg>
  );
}
