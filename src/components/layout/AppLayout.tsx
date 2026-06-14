'use client';

import React, { useState, ReactNode } from 'react';
import { I18nProvider, useI18n } from '@/lib/i18n/context';
import { DeviceProvider } from '@/lib/device/context';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import DashboardPage from '@/app/dashboard/page';
import ConnectionPage from '@/app/connection/page';
import ParametersPage from '@/app/parameters/page';
import DownloadPage from '@/app/download/page';
import SystemTestPage from '@/app/systemTest/page';
import SettingsPage from '@/app/settings/page';
import AboutPage from '@/app/about/page';

const pageComponents: Record<string, React.FC> = {
  dashboard: DashboardPage,
  connection: ConnectionPage,
  parameters: ParametersPage,
  download: DownloadPage,
  systemTest: SystemTestPage,
  settings: SettingsPage,
  about: AboutPage,
};

function AppLayoutContent() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const PageComponent = pageComponents[currentPage] || DashboardPage;

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
          <PageComponent />
        </main>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children?: ReactNode }) {
  return (
    <I18nProvider>
      <DeviceProvider>
        <AppLayoutContent />
      </DeviceProvider>
    </I18nProvider>
  );
}
