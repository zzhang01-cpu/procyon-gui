'use client';

import React, { useState, ReactNode } from 'react';
import { I18nProvider, useI18n } from '@/lib/i18n/context';
import { DeviceProvider, useDevice } from '@/lib/device/context';
import {
  LayoutDashboard,
  Settings2,
  Download,
  Clock,
  Info,
  Activity,
  Settings,
  Wifi,
  WifiOff,
  Usb,
  Languages,
  Battery,
  Cpu,
  HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import HomePage from '@/app/home/page';
import DeviceInitPage from '@/app/deviceInit/page';
import DownloadPage from '@/app/download/page';
import WorkHistoryPage from '@/app/workHistory/page';
import ConfigStatusPage from '@/app/configStatus/page';
import DeviceMonitoringPage from '@/app/deviceMonitoring/page';
import SettingsPage from '@/app/settings/page';

function AppLayoutContent() {
  const [currentPage, setCurrentPage] = useState('home');
  const { t } = useI18n();
  const { connected, connecting, deviceInfo, connect, disconnect } = useDevice();
  const batteryVoltage = deviceInfo?.batteryVoltage;
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');

  const menuItems = [
    { id: 'home', label: t.nav.home, icon: LayoutDashboard },
    { id: 'deviceInit', label: t.nav.deviceInit, icon: Settings2 },
    { id: 'downloadUpload', label: t.nav.downloadUpload, icon: Download },
    { id: 'workHistory', label: t.nav.workHistory, icon: Clock },
    { id: 'configStatus', label: t.nav.configStatus, icon: Info },
    { id: 'deviceMonitoring', label: t.nav.deviceMonitoring, icon: Activity },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'zh' ? 'en' : 'zh');
  };

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Usb className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">Procyon CM</h1>
              <p className="text-xs text-slate-400">Unified Data Logger</p>
            </div>
          </div>
        </div>

        {/* Connection Section */}
        <div className="px-4 py-3 border-b border-slate-700 space-y-2">
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-slate-400" />
            )}
            <span className={cn('text-sm', connected ? 'text-green-400' : 'text-slate-400')}>
              {connected ? t.connection.connected : t.connection.disconnected}
            </span>
          </div>
          <button
            onClick={connected ? disconnect : connect}
            disabled={connecting}
            className={cn(
              'w-full text-xs py-2 rounded font-medium transition-colors',
              connected
                ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30',
              connecting && 'opacity-50 cursor-not-allowed'
            )}
          >
            {connecting ? (t.leftPanel as Record<string, string>).connecting : connected ? (t.leftPanel as Record<string, string>).disconnect : (t.leftPanel as Record<string, string>).connect}
          </button>
        </div>

        {/* Device Info (when connected) */}
        {connected && deviceInfo && (
          <div className="px-4 py-3 border-b border-slate-700 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-slate-500" />
              <span>Firmware: {deviceInfo.firmwareVersion || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <HardDrive className="w-3.5 h-3.5 text-slate-500" />
              <span>Tool SN: {deviceInfo.toolSN || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Battery className="w-3.5 h-3.5 text-slate-500" />
              <span>Battery: {batteryVoltage} mV</span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer: Language Toggle */}
        <div className="px-4 py-3 border-t border-slate-700">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <Languages className="w-4 h-4" />
            <span>{language === 'zh' ? 'English' : '中文'}</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto">
          {currentPage === 'home' && <HomePage onNavigate={setCurrentPage} />}
          {currentPage === 'deviceInit' && <DeviceInitPage onNavigate={setCurrentPage} />}
          {currentPage === 'downloadUpload' && <DownloadPage onNavigate={setCurrentPage} />}
          {currentPage === 'workHistory' && <WorkHistoryPage onNavigate={setCurrentPage} />}
          {currentPage === 'configStatus' && <ConfigStatusPage onNavigate={setCurrentPage} />}
          {currentPage === 'deviceMonitoring' && <DeviceMonitoringPage onNavigate={setCurrentPage} />}
          {currentPage === 'settings' && <SettingsPage />}
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
