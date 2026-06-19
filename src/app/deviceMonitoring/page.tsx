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

  // Poll sensor data for real-time monitoring
  useEffect(() => {
    if (activeTab !== 'realtime' || !connected || !sensorPolling) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled && sensorPolling) {
        try {
          const data = await getSensorData();
          if (!cancelled) setSensorData(data);
        } catch {
          // ignore polling errors
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [activeTab, connected, sensorPolling, getSensorData]);

  const handleLaunch = async () => {
    if (!connected) return;
    setLaunching(true);
    try {
      const totalSeconds = launchHours * 3600 + launchMinutes * 60 + launchSeconds;
      const result = await launchDevice();
      if (!result.success) {
        alert('Launch failed: ' + (result.error || 'Unknown error'));
      } else {
        alert('Device launched! Will start in ' + totalSeconds + ' seconds.');
      }
    } catch (err: unknown) {
      alert('Launch error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLaunching(false);
    }
  };

  const handleErase = async () => {
    if (!connected) return;
    if (!confirm(t.deviceMonitoring?.confirmErase || 'Are you sure you want to erase all device memory?')) return;
    setErasing(true);
    try {
      const result = await eraseMemory(true);
      if (!result.success) {
        alert('Erase failed: ' + (result.error || 'Unknown error'));
      } else {
        alert('Memory erased successfully.');
      }
    } catch (err: unknown) {
      alert('Erase error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setErasing(false);
    }
  };

  const selfTestItems = [
    { id: 'tool_sn_set', name: 'Tool SN Set' },
    { id: 'rtc', name: 'RTC' },
    { id: 'battery_voltage', name: 'Battery Voltage' },
    { id: 'ambient_temp', name: 'Ambient Temperature' },
    { id: 'set_reset_test_mode', name: 'Set Reset Test Mode' },
    { id: 'gyro', name: 'Gyro' },
    { id: 'accel_gyro', name: 'Accel + Gyro' },
    { id: 'accel', name: 'Accel' },
    { id: 'rotation', name: 'Rotation' },
    { id: 'high_shock', name: 'High Shock' },
    { id: 'erasing_memory', name: 'Erasing Memory' },
    { id: 'set_reset_test_mode_2', name: 'Set Reset Test Mode (End)' },
  ];

  const toggleTest = (id: string) => {
    setSelectedTests(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
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
      alert('Please select at least one test item.');
      return;
    }
    setShowTestResults(true);
    try {
      await runSelfTest(selectedTests);
    } catch (err: unknown) {
      alert('Self-test error: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const passedCount = testResults.filter(r => r.pass).length;
  const failedCount = testResults.filter(r => !r.pass).length;

  // Sensor display cards for real-time tab
  const sensorCards = [
    { key: 'temperatureCM', label: 'Temperature (CM)', unit: '\u00B0C', icon: '\uD83C\uDF21\uFE0F' },
    { key: 'batteryVoltage', label: 'Battery Voltage', unit: 'mV', icon: '\uD83D\uDD0B' },
    { key: 'highShockCM', label: 'High Shock', unit: 'g', icon: '\u26A1' },
    { key: 'lowShockCM', label: 'Low Shock (CM)', unit: 'g', icon: '\uD83D\uDCA8' },
    { key: 'lowShockEM', label: 'Low Shock (EM)', unit: 'g', icon: '\uD83D\uDCA8' },
    { key: 'pressureCM', label: 'Pressure (CM)', unit: 'psi', icon: '\uD83D\uDCCA' },
    { key: 'pressureEM', label: 'Pressure (EM)', unit: 'psi', icon: '\uD83D\uDCCA' },
    { key: 'rotationalCM', label: 'Rotation (CM)', unit: 'rpm', icon: '\uD83D\uDD04' },
    { key: 'rotationalEM', label: 'Rotation (EM)', unit: 'rpm', icon: '\uD83D\uDD04' },
    { key: 'temperatureEM', label: 'Temperature (EM)', unit: '\u00B0C', icon: '\uD83C\uDF21\uFE0F' },
    { key: 'limpetEM', label: 'Limpet (EM)', unit: '', icon: '\uD83D\uDCE1' },
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
          Real-Time
        </button>
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'system'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('system')}
        >
          System
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
                onClick={() => setSensorPolling(!sensorPolling)}
                disabled={!connected}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                  sensorPolling
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                } ${!connected ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {sensorPolling ? 'Stop Monitoring' : 'Start Monitoring'}
              </button>
              <span className="text-sm text-gray-500">
                {!connected ? 'Device not connected' : sensorPolling ? 'Polling every 2 seconds...' : 'Click to start real-time monitoring'}
              </span>
            </div>

            {/* Launch Device Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Launch Device (Delayed Start)</h3>
              <p className="text-xs text-gray-500 mb-4">
                Configure the device to start recording after a specified delay. The device will automatically begin logging data when the timer expires.
              </p>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Hours:</label>
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
                  <label className="text-sm text-gray-600">Minutes:</label>
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
                  <label className="text-sm text-gray-600">Seconds:</label>
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
                  Total: {launchHours * 3600 + launchMinutes * 60 + launchSeconds} seconds
                </div>
              </div>
              <button
                onClick={handleLaunch}
                disabled={!connected || launching || (launchHours === 0 && launchMinutes === 0 && launchSeconds === 0)}
                className="px-6 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {launching ? 'Launching...' : 'Launch Device'}
              </button>
            </div>

            {/* Erase Memory */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Erase Memory</h3>
              <p className="text-xs text-gray-500 mb-4">
                Erase all data stored on the device memory. This action cannot be undone.
              </p>
              <button
                onClick={handleErase}
                disabled={!connected || erasing}
                className="px-6 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {erasing ? 'Erasing...' : 'Erase All Memory'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="space-y-6">
            {/* Test Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Self-Test Items</h3>
                <div className="flex gap-2">
                  <button onClick={selectAllTests} className="text-xs text-blue-600 hover:text-blue-800">Select All</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={deselectAllTests} className="text-xs text-gray-500 hover:text-gray-700">Deselect All</button>
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
                  <span className="text-sm text-gray-600">Erase Memory Before Test</span>
                </label>
                <button
                  onClick={handleSelfTest}
                  disabled={!connected || selectedTests.length === 0}
                  className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Single Start
                </button>
              </div>
            </div>

            {/* Self-Test Progress */}
            {selfTestProgress && (
              <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Test Progress</h3>
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
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Test Results</h3>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-green-600">{passedCount} Passed</span>
                    <span className="text-red-600">{failedCount} Failed</span>
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
            <h3 className="text-lg font-semibold mb-4">Set Tool SN</h3>
            <input
              type="text"
              value={toolSN}
              onChange={e => setToolSN(e.target.value)}
              placeholder="Enter Tool Serial Number"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowToolSNDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowToolSNDialog(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
