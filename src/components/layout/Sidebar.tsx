'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { t } = useI18n();
  const { connected } = useDevice();

  const menuItems = [
    { id: 'home', label: t.nav.home, icon: LayoutDashboard },
    { id: 'deviceInit', label: t.nav.deviceInit, icon: Settings2 },
    { id: 'downloadUpload', label: t.nav.downloadUpload, icon: Download },
    { id: 'workHistory', label: t.nav.workHistory, icon: Clock },
    { id: 'configStatus', label: t.nav.configStatus, icon: Info },
    { id: 'deviceMonitoring', label: t.nav.deviceMonitoring, icon: Activity },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Usb className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Procyon CM</h1>
            <p className="text-xs text-slate-400">Control Software</p>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className="px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">{t.connection.connected}</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-400">{t.connection.disconnected}</span>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
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

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700">
        <p className="text-xs text-slate-500">v1.0.0</p>
      </div>
    </div>
  );
}
