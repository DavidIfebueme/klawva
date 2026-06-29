'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KlawvaMark } from '../icons/KlawvaMark';
import { Button } from '../ui/Button';
import { useDashboardAuth } from '../dashboard-auth-provider';
import { LayoutDashboard, Wallet, LogOut } from 'lucide-react';

export function DashboardNavbar() {
  const { user, logout } = useDashboardAuth();
  const pathname = usePathname();

  const isLinkActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard' || pathname.startsWith('/dashboard/sessions');
    }
    return pathname === path;
  };

  return (
    <nav className="fixed top-0 left-0 w-full h-16 z-50 bg-klawva-bg/85 backdrop-blur-md border-b border-klawva-border">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-3">
            <KlawvaMark size={28} />
            <span className="font-syne font-bold text-klawva-accent tracking-widest text-lg">KLAWVA</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link
              href="/dashboard"
              className={`flex items-center gap-2 text-sm transition-colors ${
                isLinkActive('/dashboard') ? 'text-klawva-accent' : 'text-klawva-muted hover:text-klawva-text'
              }`}
            >
              <LayoutDashboard size={16} />
              <span>Workers</span>
            </Link>
            <Link
              href="/dashboard/wallet"
              className={`flex items-center gap-2 text-sm transition-colors ${
                isLinkActive('/dashboard/wallet') ? 'text-klawva-accent' : 'text-klawva-muted hover:text-klawva-text'
              }`}
            >
              <Wallet size={16} />
              <span>Wallet</span>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden sm:inline text-xs font-mono text-klawva-muted border-r border-klawva-border pr-4">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={logout} className="flex items-center gap-2">
            <LogOut size={14} />
            <span>Logout</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
