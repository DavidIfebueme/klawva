'use client';

import React from 'react';
import { DashboardAuthProvider } from '@/components/dashboard-auth-provider';
import { DashboardNavbar } from '@/components/layout/DashboardNavbar';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isNoNavbarPage = pathname === '/dashboard/login' || pathname === '/dashboard/auth/verify';

  return (
    <DashboardAuthProvider>
      <div className="min-h-screen bg-klawva-bg flex flex-col font-mono text-klawva-text">
        {!isNoNavbarPage && <DashboardNavbar />}
        <main className={`flex-grow w-full max-w-7xl mx-auto px-6 ${isNoNavbarPage ? '' : 'pt-24 pb-12'}`}>
          {children}
        </main>
      </div>
    </DashboardAuthProvider>
  );
}
