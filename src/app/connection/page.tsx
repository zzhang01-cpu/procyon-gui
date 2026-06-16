'use client';

import { useDevice } from '@/lib/device/context';
import { useI18n } from '@/lib/i18n/context';
import { isElectron, diagnoseUsb } from '@/lib/usb/procyon';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Usb, Stethoscope } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ConnectionPage() {
  const { t } = useI18n();
  const {
    connected,
    connecting,
    deviceInfo,
    error,
    usbDevices,
    connect,
    disconnect,
    refreshDevices,
    clearError,
  } = useDevice();

  useEffect(() => {
    if (isElectron()) {
      refreshDevices();
    }
  }, [refreshDevices]);

  const electronAvailable = isElectron();
  const [diagResult, setDiagResult] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const runDiagnose = async () => {
    setDiagnosing(true);
    try {
      const result = await diagnoseUsb();
      // Display raw JSON so we don't lose any diagnostic data
      setDiagResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setDiagResult(`Diagnose failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setDiagnosing(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t.connection.title}</h1>
        <p className="text-sm text-slate-500 mt-1">{t.connection.subtitle}</p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm flex-1">{error}</span>
          <button onClick={clearError} className="text-red-500 hover:text-red-700 text-sm font-medium">x</button>
        </div>
      )}

      {/* Not in Electron Warning */}
      {!electronAvailable && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm flex-1">
            {t.connection.notElectron}
          </span>
        </div>
      )}

      {/* Connection Card */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Usb className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-medium text-slate-900">{t.connection.status}</h2>
          </div>
          {connected ? (
            <button
              onClick={disconnect}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
            >
              {t.connection.disconnect}
            </button>
          ) : (
            <button
              onClick={() => connect()}
              disabled={connecting || !electronAvailable}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
              {connecting ? t.connection.connecting : t.connection.connect}
            </button>
          )}
        </div>

        {connected ? (
          <div className="flex flex-col items-center py-8">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-lg font-medium text-green-600">{t.connection.connected}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-8">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <Usb className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-lg font-medium text-slate-900">{t.connection.noDevice}</p>
            <p className="text-sm text-slate-500 mt-1">{t.connection.pleaseConnect}</p>
          </div>
        )}
      </div>

      {/* USB Device Scanning */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Usb className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-medium text-slate-900">{t.connection.usbDevice}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runDiagnose}
              disabled={!electronAvailable || diagnosing}
              className="px-3 py-2 border border-amber-300 text-amber-700 rounded-md hover:bg-amber-50 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              {diagnosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
              Diagnose
            </button>
            <button
              onClick={refreshDevices}
              disabled={!electronAvailable}
              className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              {t.connection.scanDevices}
            </button>
          </div>
        </div>

        {diagResult && (
          <pre className="text-xs bg-slate-900 text-green-400 p-3 rounded-lg mb-4 overflow-x-auto font-mono whitespace-pre-wrap">{diagResult}</pre>
        )}

        {!electronAvailable ? (
          <p className="text-sm text-slate-500">{t.connection.notElectron}</p>
        ) : usbDevices.length > 0 ? (
          <div className="space-y-2">
            {usbDevices.map((device, index) => (
              <div
                key={index}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200"
              >
                <Usb className="h-5 w-5 text-blue-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {device.vendorId === '0x2269' && device.productId === '0xbeef' ? 'Procyon CM' : 'USB Device'} (VID: {device.vendorId}, PID: {device.productId})
                  </p>
                  <p className="text-xs text-slate-500">
                    Device Address: {device.deviceAddress}
                  </p>
                </div>
                {device.vendorId === '0x2269' && device.productId === '0xbeef' ? (
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                    Procyon
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                    Other
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-slate-500">{t.connection.noDevice}</p>
            <p className="text-xs text-slate-400 mt-1">
              VID: 0x2269, PID: 0xBEEF — {t.connection.pleaseConnect}
            </p>
          </div>
        )}
      </div>

      {/* Device Info Card */}
      {connected && deviceInfo && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">{t.connection.deviceInfo}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-500">{t.connection.firmwareVersion}</label>
              <p className="font-mono text-slate-900">{deviceInfo.firmwareVersion || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-slate-500">{t.connection.serialNumber}</label>
              <p className="font-mono text-slate-900">{deviceInfo.serialNumber || deviceInfo.toolSN || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-slate-500">{t.connection.uniqueId}</label>
              <p className="font-mono text-slate-900 text-sm">{deviceInfo.uniqueId || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-slate-500">{t.connection.batteryVoltage}</label>
              <p className="font-mono text-slate-900">
                {deviceInfo.batteryVoltage !== undefined ? `${deviceInfo.batteryVoltage.toFixed(2)} V` : '-'}
              </p>
            </div>
            <div>
              <label className="text-sm text-slate-500">{t.connection.temperature}</label>
              <p className="font-mono text-slate-900">
                {deviceInfo.temperature !== undefined ? `${deviceInfo.temperature.toFixed(1)} °C` : '-'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
