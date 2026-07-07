import React from 'react';

export function LeadScoutIcon({ size = 48, color = '#E8FF47', className = '' }: { size?: number; color?: string; className?: string }) {
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
      {/* Magnifying glass */}
      <circle cx="20" cy="20" r="12" />
      <line x1="29" y1="29" x2="42" y2="42" />
      {/* Person silhouette inside lens */}
      <circle cx="20" cy="17" r="3" />
      <path d="M14 27c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </svg>
  );
}
