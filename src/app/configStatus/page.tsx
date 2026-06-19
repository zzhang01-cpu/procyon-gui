'use client';

import { useState, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';

export default function ConfigStatusPage() {
  const { t } = useI18n();
  const { connected, deviceInfo, deviceParams, loadDeviceParams } = useDevice();
  const [loading, setLoading] = useState(false);

  const cs = t.configStatus;

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
      title: cs.jobInfo,
      items: [
        { label: cs.customer, value: deviceParams?.customer || 'N/A' },
        { label: cs.country, value: deviceParams?.country || 'N/A' },
        { label: cs.district, value: deviceParams?.district || 'N/A' },
        { label: cs.runID, value: deviceParams?.runID || 'N/A' },
        { label: cs.runIDType, value: deviceParams?.runIDType || 'N/A' },
        { label: cs.ldap, value: deviceParams?.ldap || 'N/A' },
        { label: cs.depthOut, value: deviceParams?.depthOut || 'N/A' },
        { label: cs.uniqueId, value: deviceParams?.uniqueId || 'N/A' },
      ],
    },
    {
      title: cs.toolInfo,
      items: [
        { label: cs.toolSNLabel, value: deviceParams?.toolSN || deviceInfo?.serialNumber || 'N/A' },
        { label: cs.toolType, value: deviceParams?.toolType || 'N/A' },
        { label: cs.toolSize, value: deviceParams?.toolSize || 'N/A' },
        { label: cs.toolPosition, value: deviceParams?.toolPosition || 'N/A' },
        { label: cs.axialPosition, value: deviceParams?.toolAxialPosition || 'N/A' },
        { label: cs.configName, value: deviceParams?.configName || 'N/A' },
        { label: cs.housingSN, value: cs.setOnly },
        { label: cs.bhaSerialNumber, value: cs.setOnly },
        { label: cs.sensorHeadSN, value: cs.setOnly },
        { label: cs.bitBladeNumber, value: cs.setOnly },
        { label: cs.bitBOM, value: cs.setOnly },
      ],
    },
    {
      title: cs.connectionInfo,
      items: [
        { label: cs.uhConnectionType, value: cs.setOnly },
        { label: cs.dhConnectionType, value: cs.setOnly },
      ],
    },
    {
      title: cs.sensorInfo,
      items: [
        { label: cs.intPressureSN, value: cs.setOnly },
        { label: cs.extPressureSN, value: cs.setOnly },
        { label: cs.limpetSN, value: cs.setOnly },
        { label: cs.amplifierDACOffset, value: cs.setOnly },
        { label: cs.amplifier1stStageGain, value: cs.setOnly },
        { label: cs.amplifier2ndStageGain, value: cs.setOnly },
      ],
    },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">{cs.title}</h2>
        {connected && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? t.common.loadingEllipsis : t.common.refresh}
          </button>
        )}
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        {!connected ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-500">{cs.noDeviceConnected}</p>
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
                  {cs.serialNumber}: {deviceInfo?.serialNumber || 'N/A'} | {cs.firmwareVersion}: {deviceInfo?.firmwareVersion || 'N/A'}
                </p>
              </div>
              <div className="flex gap-6">
                <div className="text-right">
                  <p className="text-xs text-slate-500">{cs.battery}</p>
                  <p className="text-sm font-medium text-slate-800">{deviceInfo?.batteryVoltage ? `${deviceInfo.batteryVoltage} mV` : 'N/A'}</p>
                </div>
                {deviceInfo?.temperature !== undefined && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500">{cs.temperature}</p>
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
                          item.value === cs.setOnly ? 'text-amber-500 italic' :
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
