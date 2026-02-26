'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  href?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  href,
  ...props
}: ButtonProps) {
  const baseStyles = 'relative inline-flex items-center justify-center overflow-hidden transition-all duration-200 uppercase tracking-wider font-syne font-bold outline-none rounded';
  
  const sizeStyles = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  };

  const variantStyles = {
    primary: 'bg-klawva-accent text-klawva-bg hover:brightness-110',
    secondary: 'border border-klawva-border text-klawva-text bg-transparent hover:border-klawva-accent hover:text-klawva-accent',
    ghost: 'text-klawva-muted hover:text-klawva-text bg-transparent',
  };

  const content = (
    <>
      <span className={`relative z-10 flex items-center gap-2 ${loading ? 'opacity-0' : 'opacity-100'}`}>
        {children}
      </span>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {variant === 'primary' && !loading && (
        <motion.div
          className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12"
          initial={{ x: '-150%' }}
          whileHover={{ x: '150%' }}
          transition={{ duration: 0.4, ease: 'linear' }}
        />
      )}
    </>
  );

  const classes = `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${loading ? 'cursor-not-allowed' : ''} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button className={classes} disabled={loading || props.disabled} {...props}>
      {content}
    </button>
  );
}
