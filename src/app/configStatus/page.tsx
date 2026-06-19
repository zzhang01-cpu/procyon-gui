'use client';

import { useState, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';

export default function ConfigStatusPage() {
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

  const sections = [
    {
      title: 'Job Info',
      items: [
        { label: 'Customer', value: deviceParams?.customer || 'N/A' },
        { label: 'Country', value: deviceParams?.country || 'N/A' },
        { label: 'District', value: deviceParams?.district || 'N/A' },
        { label: 'Run ID', value: deviceParams?.runID || 'N/A' },
        { label: 'Run ID Type', value: deviceParams?.runIDType || 'N/A' },
        { label: 'LDAP', value: deviceParams?.ldap || 'N/A' },
        { label: 'Depth Out', value: deviceParams?.depthOut || 'N/A' },
        { label: 'Unique ID', value: deviceParams?.uniqueId || 'N/A' },
      ],
    },
    {
      title: 'Tool Info',
      items: [
        { label: 'Tool S/N', value: deviceParams?.toolSN || deviceInfo?.serialNumber || 'N/A' },
        { label: 'Tool Type', value: deviceParams?.toolType || 'N/A' },
        { label: 'Tool Size', value: deviceParams?.toolSize || 'N/A' },
        { label: 'Tool Position', value: deviceParams?.toolPosition || 'N/A' },
        { label: 'Axial Position', value: deviceParams?.toolAxialPosition || 'N/A' },
        { label: 'Config Name', value: deviceParams?.configName || 'N/A' },
        { label: 'Housing SN', value: 'SET only' },
        { label: 'BHA Serial Number', value: 'SET only' },
        { label: 'Sensor Head SN', value: 'SET only' },
        { label: 'Bit Blade Number', value: 'SET only' },
        { label: 'Bit BOM', value: 'SET only' },
      ],
    },
    {
      title: 'Connection Info',
      items: [
        { label: 'UH Connection Type', value: deviceParams?.uhConnectionType || 'N/A' },
        { label: 'DH Connection Type', value: deviceParams?.dhConnectionType || 'N/A' },
      ],
    },
    {
      title: 'Sensor Info',
      items: [
        { label: 'Int Pressure Sensor SN', value: deviceParams?.intPressureSN || 'N/A' },
        { label: 'Ext Pressure Sensor SN', value: deviceParams?.extPressureSN || 'N/A' },
        { label: 'Limpet Sensor SN', value: deviceParams?.limpetSN || 'N/A' },
        { label: 'Amplifier DAC Offset', value: deviceParams?.amplifierDACOffset || 'N/A' },
        { label: 'Amplifier 1st Stage Gain', value: 'SET only' },
        { label: 'Amplifier 2nd Stage Gain', value: 'SET only' },
      ],
    },
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
            {/* Device Info Header */}
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-200">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">Procyon-CM</p>
                <p className="text-xs text-slate-500">
                  S/N: {deviceInfo?.serialNumber || 'N/A'} | FW: {deviceInfo?.firmwareVersion || 'N/A'}
                </p>
              </div>
              <div className="flex gap-6">
                <div className="text-right">
                  <p className="text-xs text-slate-500">Battery</p>
                  <p className="text-sm font-medium text-slate-800">{deviceInfo?.batteryVoltage ? `${deviceInfo.batteryVoltage} mV` : 'N/A'}</p>
                </div>
                {deviceInfo?.temperature !== undefined && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Temperature</p>
                    <p className="text-sm font-medium text-slate-800">{deviceInfo.temperature.toFixed(1)} °C</p>
                  </div>
                )}
              </div>
            </div>

            {/* Config Sections */}
            <div className="space-y-5">
              {sections.map((section) => (
                <div key={section.title}>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{section.title}</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                    {section.items.map((item) => (
                      <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-slate-100">
                        <span className="text-xs text-slate-500">{item.label}</span>
                        <span className={`text-xs font-medium ${
                          item.value === 'N/A' ? 'text-slate-400' :
                          item.value === 'SET only' ? 'text-amber-500 italic' :
                          'text-slate-800'
                        }`}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
