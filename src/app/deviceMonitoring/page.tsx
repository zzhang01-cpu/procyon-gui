'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Button } from '@/components/ui/button';
import { Check, Play, Square, Loader2 } from 'lucide-react';

interface DeviceMonitoringPageProps {
  onNavigate: (page: string) => void;
}

type Tab = 'realtime' | 'system';

const TEST_ITEMS = [
  { id: 'toolSNSet', label: 'Tool Serial Number Set', requiresInput: true },
  { id: 'rtcTest', label: 'RTC Test' },
  { id: 'batteryTest', label: 'Battery Voltage Test' },
  { id: 'tempTest', label: 'Ambient Temperature Test' },
  { id: 'setResetMode', label: 'Set Reset Test Mode' },
  { id: 'gyroSelfTest', label: 'Gyro Self Test' },
  { id: 'accelGyroTest', label: 'Accel Gyro Self Test' },
  { id: 'accelSelfTest', label: 'Accel Self Test' },
  { id: 'rotationValidation', label: 'Rotation Validation' },
  { id: 'highShockValidation', label: 'High Shock Validation' },
  { id: 'eraseMemoryTest', label: 'Erasing Memory Test' },
  { id: 'resetTestMode', label: 'Set Reset Test Mode' },
] as const;

type TestStatus = 'pending' | 'running' | 'pass' | 'fail';

export default function DeviceMonitoringPage({ onNavigate }: DeviceMonitoringPageProps) {
  const { t } = useI18n();
  const { connected, deviceInfo, setToolSN, runSelfTest, testResults: usbTestResults, testSummary, selfTestProgress, launchDevice } = useDevice();
  const [activeTab, setActiveTab] = useState<Tab>('system');
  const [eraseMemory, setEraseMemory] = useState(true);
  const [toolSNInput, setToolSNInput] = useState(deviceInfo?.serialNumber || '');
  const [showToolSNDialog, setShowToolSNDialog] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [overallResult, setOverallResult] = useState<'idle' | 'running' | 'success' | 'fail'>('idle');
  const [testLog, setTestLog] = useState<string[]>([]);
  const [showTestResults, setShowTestResults] = useState(false);

  const handleSingleStart = useCallback(async () => {
    if (!connected) return;
    setTestRunning(true);
    setOverallResult('running');
    setTestLog([]);

    try {
      const selectedTests = TEST_ITEMS.map((item) => item.id);
      await runSelfTest(selectedTests);

      // After runSelfTest completes, results are in context (usbTestResults)
      const allPassed = usbTestResults.length > 0 && usbTestResults.every((r) => r.pass);
      setOverallResult(allPassed ? 'success' : 'fail');

      setTestLog((prev) => [
        ...prev,
        '\n=== System Test Summary ===',
        testSummary ? `Overall Result: ${allPassed ? 'Success' : 'Failed'}` : 'No summary available',
        testSummary ? `Tests Passed: ${testSummary.passed} out of ${testSummary.total}` : '',
        testSummary ? `Pass Rate: ${testSummary.passRate}%` : '',
      ]);
    } catch (err) {
      setOverallResult('fail');
      setTestLog((prev) => [
        ...prev,
        `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      ]);
    } finally {
      setTestRunning(false);
    }
  }, [connected, runSelfTest, usbTestResults, testSummary]);

  const handleSetToolSN = useCallback(async () => {
    if (toolSNInput) {
      await setToolSN(toolSNInput);
      setShowToolSNDialog(false);
    }
  }, [toolSNInput, setToolSN]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Tabs */}
      <div className="flex border-b border-slate-300 mb-4">
        <button
          onClick={() => setActiveTab('realtime')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'realtime'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.deviceMonitoring.realtime}
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'system'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.deviceMonitoring.system}
        </button>
      </div>

      {activeTab === 'realtime' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            {t.deviceMonitoring.realtimeTitle}
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
              <p className="text-xs text-slate-500">{t.deviceMonitoring.batteryVoltage}</p>
              <p className="text-2xl font-mono font-semibold text-slate-800 mt-1">
                {connected && deviceInfo ? `${deviceInfo.batteryVoltage || 0} mV` : '--'}
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
              <p className="text-xs text-slate-500">{t.deviceMonitoring.temperature}</p>
              <p className="text-2xl font-mono font-semibold text-slate-800 mt-1">
                {connected && deviceInfo ? `${deviceInfo.temperature?.toFixed(1) || '--'} °C` : '--'}
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
              <p className="text-xs text-slate-500">{t.deviceMonitoring.deviceState}</p>
              <p className="text-2xl font-semibold text-slate-800 mt-1">
                {connected ? 'Idle' : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="flex gap-4">
          {/* Left: Device info + controls */}
          <div className="flex-1">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              {/* Device Info */}
              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-200">
                <div className="w-20 h-20 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <line x1="6" y1="10" x2="6" y2="14" />
                    <line x1="10" y1="10" x2="10" y2="14" />
                    <circle cx="17" cy="12" r="2" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800">
                    {connected ? 'Procyon-CM' : 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Tool S/N: {connected && deviceInfo?.serialNumber ? deviceInfo.serialNumber : 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Firmware: {connected && deviceInfo?.firmwareVersion ? deviceInfo.firmwareVersion : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="eraseMemory"
                  checked={eraseMemory}
                  onChange={(e) => setEraseMemory(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <label htmlFor="eraseMemory" className="text-xs text-slate-600">
                  {t.deviceMonitoring.eraseMemoryData}
                </label>
              </div>

              {/* Status */}
              <div className="text-center mb-4">
                {overallResult === 'idle' && (
                  <span className="text-xs text-slate-400">
                    {t.deviceMonitoring.notInitiated}
                  </span>
                )}
                {overallResult === 'running' && (
                  <span className="text-xs text-blue-600 flex items-center justify-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t.deviceMonitoring.running}
                  </span>
                )}
                {overallResult === 'success' && (
                  <Button
                    onClick={() => setShowTestResults(true)}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs"
                  >
                    {t.deviceMonitoring.successViewDetails}
                  </Button>
                )}
                {overallResult === 'fail' && (
                  <span className="text-xs text-red-600">
                    {t.deviceMonitoring.testFailed}
                  </span>
                )}
              </div>

              {/* Start Button */}
              <div className="flex justify-center">
                <button
                  onClick={handleSingleStart}
                  disabled={!connected || testRunning}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    testRunning
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                  }`}
                  title="Single Start"
                >
                  {testRunning ? (
                    <Square className="w-5 h-5 text-white" />
                  ) : (
                    <Play className="w-5 h-5 text-white ml-0.5" />
                  )}
                </button>
              </div>

              {/* Tool SN Dialog */}
              {showToolSNDialog && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-xs text-yellow-800 mb-2">
                    {t.deviceMonitoring.pleaseEnterToolSN}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={toolSNInput}
                      onChange={(e) => setToolSNInput(e.target.value)}
                      className="flex-1 border border-yellow-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter Tool SN"
                    />
                    <Button
                      onClick={handleSetToolSN}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Set
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Test checklist */}
          <div className="w-64">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <h4 className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wider">
                {t.deviceMonitoring.testSequence}
              </h4>
              <div className="space-y-2">
                {TEST_ITEMS.map((item) => {
                  const result = usbTestResults.find((r) => r.id === item.id);
                  const status: TestStatus = selfTestProgress?.testId === item.id
                    ? 'running'
                    : result
                    ? (result.pass ? 'pass' : 'fail')
                    : 'pending';
                  return (
                    <div key={item.id} className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          status === 'pending'
                            ? 'bg-slate-300'
                            : status === 'running'
                            ? 'bg-blue-500 animate-pulse'
                            : status === 'pass'
                            ? 'bg-green-500'
                            : 'bg-red-500'
                        }`}
                      />
                      <span
                        className={`text-xs ${
                          status === 'pending'
                            ? 'text-slate-400'
                            : status === 'running'
                            ? 'text-blue-600 font-semibold'
                            : status === 'pass'
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {item.label}
                      </span>
                      {result?.detail && (
                        <span className="text-[10px] text-slate-400 ml-auto">{result.detail}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test Results Modal */}
      {showTestResults && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800">
                {t.deviceMonitoring.systemTestSummary}
              </h3>
              <button
                onClick={() => setShowTestResults(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                x
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[60vh]">
              <pre className="text-xs text-slate-700 font-mono whitespace-pre-wrap">
                {testLog.join('\n')}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
