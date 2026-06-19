'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';

interface ConfigStatusPageProps {
  onNavigate: (page: string) => void;
}

export default function ConfigStatusPage({ onNavigate }: ConfigStatusPageProps) {
  const { t } = useI18n();
  const { connected, deviceInfo, deviceParams } = useDevice();

  const configItems = [
    { label: 'Tool S/N', value: deviceParams?.toolSN || deviceInfo?.serialNumber || 'N/A' },
    { label: 'Customer', value: deviceParams?.customer || 'N/A' },
    { label: 'Country', value: deviceParams?.country || 'N/A' },
    { label: 'District', value: deviceParams?.district || 'N/A' },
    { label: 'Run ID', value: deviceParams?.runID || 'N/A' },
    { label: 'Run ID Type', value: deviceParams?.runIDType || 'N/A' },
    { label: 'Tool Type', value: deviceParams?.toolType || 'N/A' },
    { label: 'Tool Size', value: deviceParams?.toolSize || 'N/A' },
    { label: 'Tool Position', value: deviceParams?.toolPosition || 'N/A' },
    { label: 'Config Name', value: deviceParams?.configName || 'N/A' },
    { label: 'LDAP', value: deviceParams?.ldap || 'N/A' },
    { label: 'Depth Out', value: deviceParams?.depthOut || 'N/A' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">{t.configStatus.title}</h2>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        {!connected ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-500">{t.configStatus.noDeviceConnected}</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Procyon-CM</p>
                <p className="text-xs text-slate-500">S/N: {deviceInfo?.serialNumber || 'N/A'}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              {configItems.map((item) => (
                <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-xs text-slate-500">{item.label}</span>
                  <span className="text-xs font-medium text-slate-800">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
