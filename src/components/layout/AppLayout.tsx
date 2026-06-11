'use client';

import React, { useState, ReactNode } from 'react';
import { I18nProvider, useI18n } from '@/lib/i18n/context';
import { DeviceProvider } from '@/lib/device/context';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

function AppLayoutContent({ children }: { children: ReactNode }) {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { t } = useI18n();

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header currentPage={currentPage} />

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <DeviceProvider>
        <AppLayoutContent>{children}</AppLayoutContent>
      </DeviceProvider>
    </I18nProvider>
  );
}
