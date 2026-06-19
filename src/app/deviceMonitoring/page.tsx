'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDevice } from '@/lib/device/context';
import { useI18n } from '@/lib/i18n/context';

export default function DeviceMonitoringPage() {
  const { connected, deviceInfo, testResults, selfTestProgress, runSelfTest, launchDevice, eraseMemory, getSensorData } = useDevice();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'realtime' | 'system'>('realtime');
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [eraseBeforeTest, setEraseBeforeTest] = useState(true);
  const [toolSN, setToolSN] = useState('');
  const [showToolSNDialog, setShowToolSNDialog] = useState(false);
  const [showTestResults, setShowTestResults] = useState(false);
  const [launchHours, setLaunchHours] = useState(0);
  const [launchMinutes, setLaunchMinutes] = useState(30);
  const [launchSeconds, setLaunchSeconds] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [sensorData, setSensorData] = useState<Record<string, string>>({});
  const [sensorPolling, setSensorPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  const dm = t.deviceMonitoring;

  // Poll sensor data for real-time monitoring
  useEffect(() => {
    if (activeTab !== 'realtime' || !connected || !sensorPolling) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled && sensorPolling) {
        try {
          const data = await getSensorData();
          if (!cancelled) {
            if (data && data.error) {
              setPollError(data.error);
            } else {
              setPollError(null);
              setSensorData(data || {});
            }
          }
        } catch (err) {
          if (!cancelled) {
            setPollError(err instanceof Error ? err.message : 'Polling failed');
          }
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [activeTab, connected, sensorPolling, getSensorData]);

  const handleLaunch = async () => {
    if (!connected) return;
    setLaunching(true);
    try {
      const totalSec = launchHours * 3600 + launchMinutes * 60 + launchSeconds;
      console.log('[DeviceMonitoring] Launching device with delay:', totalSec, 'seconds');
      const result = await launchDevice(totalSec);
      console.log('[DeviceMonitoring] Launch result:', JSON.stringify(result));
      if (!result.success) {
        const errDetail = result.error || result.detail || t.errors.unknownError;
        alert(dm.launchFailed + errDetail);
      } else {
        const detail = result.detail || String(totalSec) + 's';
        alert(dm.launchSuccess.replace('{0}', detail));
      }
    } catch (err: unknown) {
      console.error('[DeviceMonitoring] Launch error:', err);
      alert(dm.launchError + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLaunching(false);
    }
  };

  const handleErase = async () => {
    if (!connected) return;
    if (!confirm(dm.confirmErase)) return;
    setErasing(true);
    try {
      const result = await eraseMemory(true);
      if (!result.success) {
        alert(dm.eraseFailed + (result.error || t.errors.unknownError));
      } else {
        alert(dm.eraseSuccess);
      }
    } catch (err: unknown) {
      alert(dm.eraseError + (err instanceof Error ? err.message : String(err)));
    } finally {
      setErasing(false);
    }
  };

  const selfTestItems = [
    { id: 'tool_sn_set', name: dm.testItemToolSN },
    { id: 'rtc', name: dm.testItemRTC },
    { id: 'battery_voltage', name: dm.testItemBattery },
    { id: 'ambient_temp', name: dm.testItemAmbientTemp },
    { id: 'set_reset_test_mode', name: dm.testItemSetResetMode },
    { id: 'gyro', name: dm.testItemGyro },
    { id: 'accel_gyro', name: dm.testItemAccelGyro },
    { id: 'accel', name: dm.testItemAccel },
    { id: 'rotation', name: dm.testItemRotation },
    { id: 'high_shock', name: dm.testItemHighShock },
    { id: 'erasing_memory', name: dm.testItemErasingMemory },
    { id: 'set_reset_test_mode_2', name: dm.testItemSetResetMode2 },
  ];

  const toggleTest = (id: string) => {
    setSelectedTests(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllTests = () => {
    setSelectedTests(selfTestItems.map(item => item.id));
  };

  const deselectAllTests = () => {
    setSelectedTests([]);
  };

  const handleSelfTest = async () => {
    if (!connected) return;
    if (selectedTests.length === 0) {
      alert(dm.selectAtLeastOne);
      return;
    }
    setShowTestResults(true);
    try {
      await runSelfTest(selectedTests);
    } catch (err: unknown) {
      alert(dm.selfTestError + (err instanceof Error ? err.message : String(err)));
    }
  };

  const passedCount = testResults.filter(r => r.pass).length;
  const failedCount = testResults.filter(r => !r.pass).length;

  // Sensor display cards for real-time tab
  const sensorCards = [
    { key: 'temperatureCM', label: dm.temperatureCM, unit: '\u00B0C', icon: '\uD83C\uDF21\uFE0F' },
    { key: 'batteryVoltage', label: dm.batteryVoltage, unit: 'mV', icon: '\uD83D\uDD0B' },
    { key: 'highShockCM', label: dm.highShock, unit: 'g', icon: '\u26A1' },
    { key: 'lowShockCM', label: dm.lowShockCM, unit: 'g', icon: '\uD83D\uDCA8' },
    { key: 'lowShockEM', label: dm.lowShockEM, unit: 'g', icon: '\uD83D\uDCA8' },
    { key: 'pressureCM', label: dm.pressureCM, unit: 'psi', icon: '\uD83D\uDCCA' },
    { key: 'pressureEM', label: dm.pressureEM, unit: 'psi', icon: '\uD83D\uDCCA' },
    { key: 'rotationalCM', label: dm.rotationCM, unit: 'rpm', icon: '\uD83D\uDD04' },
    { key: 'rotationalEM', label: dm.rotationEM, unit: 'rpm', icon: '\uD83D\uDD04' },
    { key: 'temperatureEM', label: dm.temperatureEM, unit: '\u00B0C', icon: '\uD83C\uDF21\uFE0F' },
    { key: 'limpetEM', label: dm.limpetEM, unit: '', icon: '\uD83D\uDCE1' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tab Header */}
      <div className="flex border-b border-gray-200 bg-white px-4">
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'realtime'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('realtime')}
        >
          {dm.realtime}
        </button>
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'system'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('system')}
        >
          {dm.system}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'realtime' && (
          <div className="space-y-6">
            {/* Sensor Data Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {sensorCards.map(card => (
                <div key={card.key} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{card.icon}</span>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{card.label}</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {sensorData[card.key] || '--'}
                  </div>
                  {card.unit && (
                    <div className="text-xs text-gray-400 mt-1">{card.unit}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Polling Control */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (sensorPolling) {
                    setSensorPolling(false);
                    setSensorData({});
                    setPollError(null);
                  } else {
                    setSensorPolling(true);
                  }
                }}
                disabled={!connected}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                  sensorPolling
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                } ${!connected ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {sensorPolling ? dm.stopMonitoring : dm.startMonitoring}
              </button>
              <span className="text-sm text-gray-500">
                {!connected ? dm.deviceNotConnected : sensorPolling ? dm.pollingEvery : dm.clickToStart}
              </span>
              {pollError && (
                <span className="text-sm text-red-500">
                  {t.common.error}: {pollError}
                </span>
              )}
            </div>

            {/* Launch Device Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{dm.launchDevice}</h3>
              <p className="text-xs text-gray-500 mb-4">
                {dm.launchDeviceDesc}
              </p>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">{dm.hours}:</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={launchHours}
                    onChange={e => setLaunchHours(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">{dm.minutes}:</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={launchMinutes}
                    onChange={e => setLaunchMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">{dm.seconds}:</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={launchSeconds}
                    onChange={e => setLaunchSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                  />
                </div>
                <div className="ml-4 text-sm text-gray-500">
                  {dm.totalSeconds}: {launchHours * 3600 + launchMinutes * 60 + launchSeconds} {dm.seconds.toLowerCase()}
                </div>
              </div>
              <button
                onClick={handleLaunch}
                disabled={!connected || launching || (launchHours === 0 && launchMinutes === 0 && launchSeconds === 0)}
                className="px-6 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {launching ? dm.launching : dm.launchDevice}
              </button>
            </div>

            {/* Erase Memory */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{dm.eraseMemory}</h3>
              <p className="text-xs text-gray-500 mb-4">
                {dm.eraseMemoryDesc}
              </p>
              <button
                onClick={handleErase}
                disabled={!connected || erasing}
                className="px-6 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {erasing ? dm.erasing : dm.eraseAllMemory}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="space-y-6">
            {/* Test Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{dm.selfTestItems}</h3>
                <div className="flex gap-2">
                  <button onClick={selectAllTests} className="text-xs text-blue-600 hover:text-blue-800">{dm.selectAll}</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={deselectAllTests} className="text-xs text-gray-500 hover:text-gray-700">{dm.deselectAll}</button>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {selfTestItems.map(item => (
                  <label key={item.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTests.includes(item.id)}
                      onChange={() => toggleTest(item.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{item.name}</span>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={eraseBeforeTest}
                    onChange={e => setEraseBeforeTest(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">{dm.eraseMemoryBeforeTest}</span>
                </label>
                <button
                  onClick={handleSelfTest}
                  disabled={!connected || selectedTests.length === 0}
                  className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {dm.singleStart}
                </button>
              </div>
            </div>

            {/* Self-Test Progress */}
            {selfTestProgress && (
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{dm.testProgress}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{selfTestProgress.testName}</span>
                    <span className="text-gray-400">{selfTestProgress.current}/{selfTestProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 rounded-full h-2 transition-all"
                      style={{ width: `${(selfTestProgress.current / selfTestProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Test Results */}
            {showTestResults && testResults.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{dm.testResults}</h3>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-green-600">{passedCount} {dm.passed}</span>
                    <span className="text-red-600">{failedCount} {dm.failed}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {testResults.map(result => (
                    <div
                      key={result.id}
                      className={`flex items-center justify-between p-3 rounded ${
                        result.pass ? 'bg-green-50' : 'bg-red-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-lg ${result.pass ? 'text-green-500' : 'text-red-500'}`}>
                          {result.pass ? '\u2713' : '\u2717'}
                        </span>
                        <span className="text-sm font-medium text-gray-700">{result.name}</span>
                      </div>
                      {result.detail && (
                        <span className="text-xs text-gray-500">{result.detail}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tool SN Dialog */}
      {showToolSNDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">{dm.setToolSN}</h3>
            <input
              type="text"
              value={toolSN}
              onChange={e => setToolSN(e.target.value)}
              placeholder={dm.enterToolSN}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowToolSNDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={() => setShowToolSNDialog(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
              >
                {t.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
