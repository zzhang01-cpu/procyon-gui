'use client';

import React, { useState, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';

interface ConfigStatusPageProps {
  onNavigate: (page: string) => void;
}

export default function ConfigStatusPage({ onNavigate }: ConfigStatusPageProps) {
  const { t } = useI18n();
  const { connected, deviceInfo, deviceParams, loadDeviceParams } = useDevice();
  const [loading, setLoading] = useState(false);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadDeviceParams();
    } finally {
      setLoading(false);
    }
  }, [loadDeviceParams]);

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
    { label: 'Axial Position', value: deviceParams?.toolAxialPosition || 'N/A' },
    { label: 'Config Name', value: deviceParams?.configName || 'N/A' },
    { label: 'LDAP', value: deviceParams?.ldap || 'N/A' },
    { label: 'Depth Out', value: deviceParams?.depthOut || 'N/A' },
    { label: 'Unique ID', value: deviceParams?.uniqueID || 'N/A' },
    { label: 'Housing SN', value: deviceParams?.housingNumber || 'N/A' },
    { label: 'BHA Serial Number', value: deviceParams?.bhaSerialNumber || 'N/A' },
    { label: 'UH Connection Type', value: deviceParams?.uhConnectionType || 'N/A' },
    { label: 'DH Connection Type', value: deviceParams?.dhConnectionType || 'N/A' },
    { label: 'Int Pressure Sensor SN', value: deviceParams?.intPressureSN || 'N/A' },
    { label: 'Ext Pressure Sensor SN', value: deviceParams?.extPressureSN || 'N/A' },
    { label: 'Limpet Sensor SN', value: deviceParams?.limpetSN || 'N/A' },
    { label: 'Bit Blade Number', value: deviceParams?.drillBitBladeNumber || 'N/A' },
    { label: 'Bit BOM', value: deviceParams?.drillBitBOM || 'N/A' },
    { label: 'Sensor Head SN', value: deviceParams?.toolInfoSensorHeadSN || 'N/A' },
    { label: 'Amplifier DAC Offset', value: deviceParams?.amplifierDACOffset || 'N/A' },
    { label: 'Amplifier 1st Stage Gain', value: deviceParams?.amplifierFirstStageGain || 'N/A' },
    { label: 'Amplifier 2nd Stage Gain', value: deviceParams?.amplifierSecondStageGain || 'N/A' },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">{t.configStatus.title}</h2>
        {connected && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        )}
      </div>
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
                <p className="text-xs text-slate-500">S/N: {deviceInfo?.serialNumber || 'N/A'} | FW: {deviceInfo?.firmwareVersion || 'N/A'}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-slate-500">Battery</p>
                <p className="text-sm font-medium text-slate-800">{deviceInfo?.batteryVoltage || 0} mV</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-6 gap-y-2">
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
