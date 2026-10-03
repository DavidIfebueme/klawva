import React from 'react';
import { Outlet } from 'react-router-dom';
import { DashboardAuthProvider } from '@/components/dashboard-auth-provider';
import { DashboardNavbar } from '@/components/layout/DashboardNavbar';
import { useLocation } from 'react-router-dom';

export default function DashboardLayout() {
  const { pathname } = useLocation();
  const isNoNavbarPage = pathname === '/dashboard/login' || pathname === '/dashboard/auth/verify';

  return (
    <DashboardAuthProvider>
      <div className="min-h-screen bg-klawva-bg flex flex-col font-mono text-klawva-text">
        {!isNoNavbarPage && <DashboardNavbar />}
        <main className={`flex-grow w-full max-w-7xl mx-auto px-6 ${isNoNavbarPage ? '' : 'pt-24 pb-12'}`}>
          <Outlet />
        </main>
      </div>
    </DashboardAuthProvider>
  );
}
