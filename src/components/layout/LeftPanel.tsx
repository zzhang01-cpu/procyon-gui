'use client';

import React, { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Battery, Wifi, WifiOff, Clock } from 'lucide-react';

export function LeftPanel() {
  const { t, language, setLanguage } = useI18n();
  const { connected, connecting, deviceInfo, connect, disconnect } = useDevice();
  const lp = t.leftPanel;
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const locale = language === 'zh' ? 'zh-CN' : 'en-US';
      setCurrentTime(
        now.toLocaleDateString(locale, {
          month: 'numeric',
          day: 'numeric',
          year: 'numeric',
        }) +
          '  ' +
          now.toLocaleTimeString(locale, {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: language === 'en',
          })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [language]);

  const batteryVoltage = deviceInfo?.batteryVoltage || 0;
  const batteryLevel = batteryVoltage > 3600 ? 'high' : batteryVoltage > 3200 ? 'medium' : 'low';
  const batteryColor = batteryLevel === 'high' ? 'text-green-400' : batteryLevel === 'medium' ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="w-72 bg-[#1e2a3a] text-white flex flex-col shrink-0">
      {/* Time Display */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 text-slate-300">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-xs font-mono">{currentTime}</span>
        </div>
      </div>

      {/* LDAP Login Information */}
      <div className="px-4 py-3 border-t border-slate-600">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {lp.ldapLoginInfo}
        </h3>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{lp.userId}</span>
            <span className="text-xs text-slate-200 truncate ml-2">N/A</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{lp.access}</span>
            <span className="text-xs text-slate-200">{lp.admin}</span>
          </div>
        </div>
      </div>

      {/* General Connection Status */}
      <div className="px-4 py-3 border-t border-slate-600">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {lp.connectionStatus}
        </h3>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-300">{lp.internetConnection}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-300">{lp.deviceConnection}</span>
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                connected ? 'bg-green-400' : 'bg-slate-500'
              }`}
            />
          </div>
          <button
            onClick={connected ? disconnect : connect}
            disabled={connecting}
            className={`w-full mt-2 text-xs py-1.5 rounded font-medium transition-colors ${
              connected
                ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
            } ${connecting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {connecting ? lp.connecting : connected ? lp.disconnect : lp.connect}
          </button>
        </div>
      </div>

      {/* Connected Device */}
      <div className="px-4 py-3 border-t border-slate-600">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {lp.connectedDevice}
        </h3>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{lp.deviceName}</span>
            <span className="text-xs text-slate-200">
              {connected && deviceInfo ? 'Procyon-CM' : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{lp.firmwareVersion}</span>
            <span className="text-xs text-slate-200">
              {connected && deviceInfo?.firmwareVersion ? deviceInfo.firmwareVersion : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{lp.toolSN}</span>
            <span className="text-xs text-slate-200">
              {connected && deviceInfo?.serialNumber ? deviceInfo.serialNumber : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{lp.deviceState}</span>
            <span className="text-xs text-slate-200">
              {connected ? lp.idle : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Battery Voltage */}
      <div className="px-4 py-3 border-t border-slate-600">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {lp.batteryVoltage}
        </h3>
        <div className="flex items-center gap-2">
          <Battery className={`w-5 h-5 ${connected ? batteryColor : 'text-slate-500'}`} />
          <span className={`text-sm font-mono ${connected ? 'text-slate-200' : 'text-slate-500'}`}>
            {connected ? `${batteryVoltage} mV` : '0 mV'}
          </span>
        </div>
      </div>

      {/* Language Switch */}
      <div className="mt-auto px-4 py-3 border-t border-slate-600">
        <div className="flex gap-2">
          <button
            onClick={() => setLanguage('zh')}
            className={`text-xs px-2 py-1 rounded ${
              language === 'zh' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            中文
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`text-xs px-2 py-1 rounded ${
              language === 'en' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            English
          </button>
        </div>
      </div>
    </div>
  );
}
