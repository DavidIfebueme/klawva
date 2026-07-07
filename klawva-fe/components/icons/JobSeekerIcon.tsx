import React from 'react';

export function JobSeekerIcon({ size = 48, color = '#E8FF47', className = '' }: { size?: number; color?: string; className?: string }) {
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
      {/* Briefcase body */}
      <rect x="6" y="16" width="36" height="24" rx="3" />
      {/* Handle */}
      <path d="M16 16V12a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" />
      {/* Center clasp */}
      <line x1="24" y1="26" x2="24" y2="30" />
      <circle cx="24" cy="26" r="1.5" fill={color} stroke="none" />
    </svg>
  );
}
