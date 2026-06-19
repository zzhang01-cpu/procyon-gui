'use client';

import React, { useState, ReactNode } from 'react';
import { I18nProvider, useI18n } from '@/lib/i18n/context';
import { DeviceProvider } from '@/lib/device/context';
import { LeftPanel } from './LeftPanel';

function AppLayoutContent() {
  const [currentPage, setCurrentPage] = useState('home');

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Left Info Panel - always visible */}
      <LeftPanel />

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar currentPage={currentPage} onNavigate={setCurrentPage} />

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-5">
          <PageRenderer page={currentPage} onNavigate={setCurrentPage} />
        </main>
      </div>
    </div>
  );
}

function PageRenderer({ page, onNavigate }: { page: string; onNavigate: (page: string) => void }) {
  const { t } = useI18n();
  
  switch (page) {
    case 'deviceInit':
      return <DeviceInitPage onNavigate={onNavigate} />;
    case 'download':
      return <DownloadPage onNavigate={onNavigate} />;
    case 'workHistory':
      return <WorkHistoryPage onNavigate={onNavigate} />;
    case 'configStatus':
      return <ConfigStatusPage onNavigate={onNavigate} />;
    case 'deviceMonitoring':
      return <DeviceMonitoringPage onNavigate={onNavigate} />;
    case 'settings':
      return <SettingsPage />;
    case 'home':
    default:
      return <HomePage onNavigate={onNavigate} />;
  }
}

// Lazy load page components
import HomePage from '@/app/home/page';
import DeviceInitPage from '@/app/deviceInit/page';
import DownloadPage from '@/app/download/page';
import WorkHistoryPage from '@/app/workHistory/page';
import ConfigStatusPage from '@/app/configStatus/page';
import DeviceMonitoringPage from '@/app/deviceMonitoring/page';
import SettingsPage from '@/app/settings/page';

function TopBar({ currentPage, onNavigate }: { currentPage: string; onNavigate: (page: string) => void }) {
  const { t } = useI18n();
  
  return (
    <header className="h-10 bg-slate-700 text-white flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        {currentPage !== 'home' && (
          <button
            onClick={() => onNavigate('home')}
            className="text-slate-300 hover:text-white transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="text-xs">{t.nav.home}</span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-slate-400">Procyon CM - Unified Data Logger</span>
      </div>
    </header>
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
