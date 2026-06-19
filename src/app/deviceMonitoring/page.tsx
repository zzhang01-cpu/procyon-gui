'use client';

import { useState, useEffect, useRef } from 'react';
import { useDevice } from '@/lib/device/context';
import { useI18n } from '@/lib/i18n/context';

interface SensorRecord {
  timestamp: string;
  temperature: string;
  batteryVoltage: string;
  highShock: string;
  lowShock: string;
  pressure: string;
  rotational: string;
}

export default function DeviceMonitoringPage() {
  const {
    connected,
    getSensorData,
    launchDevice,
    eraseMemory,
    runSelfTest,
    deviceInfo,
    testResults,
    testSummary,
    selfTestProgress,
  } = useDevice();
  const { t } = useI18n();
  const dm = t.deviceMonitoring;

  const [activeTab, setActiveTab] = useState<'realtime' | 'system'>('realtime');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [sensorRecords, setSensorRecords] = useState<SensorRecord[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [visibleSensors, setVisibleSensors] = useState({
    temperature: true,
    battery: true,
    highShock: true,
    lowShock: true,
    pressure: true,
    rotational: true,
  });

  // Launch device
  const [launchHours, setLaunchHours] = useState(0);
  const [launchMinutes, setLaunchMinutes] = useState(30);
  const [isLaunching, setIsLaunching] = useState(false);

  // Erase memory
  const [eraseAll, setEraseAll] = useState(true);
  const [isErasing, setIsErasing] = useState(false);
  const [erasePercent, setErasePercent] = useState(0);

  // Self test
  const [isTesting, setIsTesting] = useState(false);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const pollingRef = useRef(false);

  // Self test items
  const selfTestItems = [
    'Temperature', 'Battery', 'HighShock', 'LowShock',
    'Pressure', 'Rotational', 'Limpet', 'Flash',
  ];

  // Real-time polling
  useEffect(() => {
    if (!isMonitoring || !connected) {
      pollingRef.current = false;
      return;
    }
    pollingRef.current = true;

    const poll = async () => {
      if (!pollingRef.current) return;
      try {
        const data = await getSensorData();
        if (!pollingRef.current) return;
        if (data && !data.error) {
          const now = new Date();
          const ts = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + ' ' +
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');
          setSensorRecords(prev => {
            const newRecord: SensorRecord = {
              timestamp: ts,
              temperature: data.temperatureCM || '--',
              batteryVoltage: data.batteryVoltage || '--',
              highShock: data.highShockCM || '--',
              lowShock: data.lowShockCM || '--',
              pressure: data.pressureCM || '--',
              rotational: data.rotationalCM || '--',
            };
            const updated = [newRecord, ...prev];
            return updated.slice(0, 200);
          });
          setPollError(null);
        } else {
          const errMsg = (data as Record<string, string>).error || String(dm.pollFailed || '轮询失败');
          setPollError(errMsg);
        }
      } catch {
        setPollError(String(dm.pollFailed || '轮询失败'));
      }
      if (pollingRef.current) {
        setTimeout(poll, 2000);
      }
    };

    poll();
    return () => { pollingRef.current = false; };
  }, [isMonitoring, connected, getSensorData, dm.pollFailed]);

  const handleLaunch = async () => {
    if (!connected) {
      alert(String(t.errors?.deviceNotFound || '设备未连接'));
      return;
    }
    setIsLaunching(true);
    try {
      const totalSec = launchHours * 3600 + launchMinutes * 60;
      const result = await launchDevice(totalSec);
      if (result?.success) {
        alert(String(dm.launchSuccess || '启动命令已发送') + (result.detail ? ': ' + result.detail : ''));
      } else {
        alert(String(dm.launchFailed || '启动失败') + ': ' + (result?.error || result?.detail || String(t.errors?.unknownError || '未知错误')));
      }
    } catch (err) {
      alert(String(dm.launchFailed || '启动失败') + ': ' + (err instanceof Error ? err.message : String(t.errors?.unknownError || '未知错误')));
    } finally {
      setIsLaunching(false);
    }
  };

  const handleErase = async () => {
    if (!connected) return;
    setIsErasing(true);
    setErasePercent(0);
    try {
      const result = await eraseMemory(eraseAll);
      if (result?.success) {
        setErasePercent(100);
      } else {
        alert(String(dm.eraseFailed || '擦除失败') + ': ' + (result?.error || ''));
      }
    } catch (err) {
      alert(String(dm.eraseFailed || '擦除失败') + ': ' + (err instanceof Error ? err.message : ''));
    } finally {
      setIsErasing(false);
    }
  };

  const toggleTest = (test: string) => {
    setSelectedTests(prev =>
      prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]
    );
  };

  const handleSelfTest = async () => {
    if (!connected) return;
    setIsTesting(true);
    try {
      await runSelfTest(selectedTests.length > 0 ? selectedTests : undefined);
    } catch {
      // handled by context
    } finally {
      setIsTesting(false);
    }
  };

  const toggleSensor = (key: keyof typeof visibleSensors) => {
    setVisibleSensors(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const exportCSV = () => {
    if (sensorRecords.length === 0) return;
    const headers = ['Timestamp', 'Temperature (C)', 'Battery (mV)', 'HighShock (g)', 'LowShock (g)', 'Pressure (psi)', 'Rotational (rpm)'];
    const rows = sensorRecords.map(r =>
      [r.timestamp, r.temperature, r.batteryVoltage, r.highShock, r.lowShock, r.pressure, r.rotational].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'monitoring_data.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Get battery from deviceInfo
  const batteryMv = deviceInfo?.batteryVoltage;

  return (
    <div className="h-full flex flex-col">
      {/* Tab Header */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          className={`px-6 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'realtime'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('realtime')}
        >
          {dm.realtimeTitle || '实时监控'}
        </button>
        <button
          className={`px-6 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'system'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('system')}
        >
          {dm.systemTitle || '系统测试'}
        </button>
      </div>

      {/* Real-Time Tab */}
      {activeTab === 'realtime' && (
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Left: Sensor Data Table */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Monitoring Controls */}
            <div className="flex items-center gap-3 mb-3">
              {!isMonitoring ? (
                <button
                  onClick={() => { setIsMonitoring(true); setPollError(null); }}
                  disabled={!connected}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dm.startMonitoring || '开始监控'}
                </button>
              ) : (
                <button
                  onClick={() => { setIsMonitoring(false); setPollError(null); }}
                  className="px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700"
                >
                  {dm.stopMonitoring || '停止监控'}
                </button>
              )}
              <span className="text-xs text-gray-500">
                {isMonitoring ? (dm.pollingEvery || '每2秒轮询...') : ''}
              </span>
              {sensorRecords.length > 0 && (
                <button
                  onClick={exportCSV}
                  className="ml-auto px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                >
                  {dm.exportCSV || '导出CSV'}
                </button>
              )}
              {pollError && (
                <span className="text-xs text-red-500 ml-2">{pollError}</span>
              )}
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{dm.timestamp || '时间'}</th>
                    {visibleSensors.temperature && (
                      <th className="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.temperature || '温度'} (°C)</th>
                    )}
                    {visibleSensors.battery && (
                      <th className="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.batteryVoltage || '电池'} (mV)</th>
                    )}
                    {visibleSensors.highShock && (
                      <th className="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.highShock || '高冲击'} (g)</th>
                    )}
                    {visibleSensors.lowShock && (
                      <th className="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.lowShockCM || '低冲击'} (g)</th>
                    )}
                    {visibleSensors.pressure && (
                      <th className="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.pressureCM || '压力'} (psi)</th>
                    )}
                    {visibleSensors.rotational && (
                      <th className="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.rotational || '旋转'} (rpm)</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sensorRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                        {isMonitoring
                          ? (dm.waitingData || '等待数据...')
                          : (dm.clickStart || '点击"开始监控"获取实时数据')}
                      </td>
                    </tr>
                  ) : (
                    sensorRecords.map((record, idx) => (
                      <tr key={idx} className={idx === 0 ? 'bg-blue-50' : ''}>
                        <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap font-mono">{record.timestamp}</td>
                        {visibleSensors.temperature && (
                          <td className="px-3 py-1.5 text-center text-gray-700 font-mono">{record.temperature}</td>
                        )}
                        {visibleSensors.battery && (
                          <td className="px-3 py-1.5 text-center text-gray-700 font-mono">{record.batteryVoltage}</td>
                        )}
                        {visibleSensors.highShock && (
                          <td className="px-3 py-1.5 text-center text-gray-700 font-mono">{record.highShock}</td>
                        )}
                        {visibleSensors.lowShock && (
                          <td className="px-3 py-1.5 text-center text-gray-700 font-mono">{record.lowShock}</td>
                        )}
                        {visibleSensors.pressure && (
                          <td className="px-3 py-1.5 text-center text-gray-700 font-mono">{record.pressure}</td>
                        )}
                        {visibleSensors.rotational && (
                          <td className="px-3 py-1.5 text-center text-gray-700 font-mono">{record.rotational}</td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Sensor Visibility Toggles */}
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
              {(Object.keys(visibleSensors) as Array<keyof typeof visibleSensors>).map(key => {
                const labelMap: Record<string, string> = {
                  temperature: dm.temperature || '温度',
                  battery: dm.batteryVoltage || '电池',
                  highShock: dm.highShockLabel || '高冲击',
                  lowShock: dm.lowShockLabel || '低冲击',
                  pressure: dm.pressureLabel || '压力',
                  rotational: dm.rotational || '旋转',
                };
                return (
                  <label key={key} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleSensors[key]}
                      onChange={() => toggleSensor(key)}
                      className="rounded border-gray-300"
                    />
                    {labelMap[key] || key}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="w-72 flex flex-col gap-4 flex-shrink-0">
            {/* Current Device Info Card */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">{dm.deviceStatus || '设备状态'}</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">{dm.batteryVoltage || '电池电压'}</span>
                  <span className="font-mono font-medium">{batteryMv ? batteryMv + ' mV' : '--'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{dm.temperature || '温度'}</span>
                  <span className="font-mono font-medium">{deviceInfo?.temperature ? deviceInfo.temperature + ' °C' : '--'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{dm.firmware || '固件版本'}</span>
                  <span className="font-mono font-medium">{deviceInfo?.firmwareVersion || '--'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{dm.toolSN || '工具SN'}</span>
                  <span className="font-mono font-medium">{deviceInfo?.toolSN || '--'}</span>
                </div>
              </div>
            </div>

            {/* Launch Device Card */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">{dm.launchDevice || '延时启动设备'}</h3>
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">{dm.hours || '小时'}</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={launchHours}
                    onChange={e => setLaunchHours(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">{dm.minutes || '分钟'}</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={launchMinutes}
                    onChange={e => setLaunchMinutes(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleLaunch}
                disabled={isLaunching || !connected}
                className="w-full px-3 py-2 bg-orange-500 text-white rounded text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {isLaunching ? (dm.launching || '正在启动...') : (dm.launchDevice || '启动设备')}
              </button>
            </div>

            {/* Erase Memory Card */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">{dm.eraseMemory || '擦除内存'}</h3>
              <div className="flex gap-3 mb-3 text-xs">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    checked={eraseAll}
                    onChange={() => setEraseAll(true)}
                  />
                  {dm.eraseAll || '全部擦除'}
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    checked={!eraseAll}
                    onChange={() => setEraseAll(false)}
                  />
                  {dm.eraseUsed || '擦除已用'}
                </label>
              </div>
              {isErasing && (
                <div className="mb-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: erasePercent + '%' }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 mt-1">{dm.eraseProgress || '擦除进度'}: {erasePercent}%</span>
                </div>
              )}
              <button
                onClick={handleErase}
                disabled={isErasing || !connected}
                className="w-full px-3 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {isErasing ? (dm.erasing || '正在擦除...') : (dm.eraseMemory || '擦除内存')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* System Test Tab */}
      {activeTab === 'system' && (
        <div className="max-w-2xl">
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">{dm.selectTests || '选择测试项'}</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {selfTestItems.map(item => (
                <label key={item} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTests.includes(item)}
                    onChange={() => toggleTest(item)}
                    className="rounded border-gray-300"
                  />
                  {item}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelfTest}
                disabled={isTesting || !connected}
                className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isTesting ? (dm.testing || '测试中...') : (dm.singleStart || '开始测试')}
              </button>
              {selfTestProgress && (
                <span className="text-xs text-blue-600">
                  {dm.currentTest || '当前测试'}: {selfTestProgress.testName || ''} ({selfTestProgress.current}/{selfTestProgress.total})
                </span>
              )}
            </div>
          </div>

          {/* Test Results */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{dm.testResults || '测试结果'}</h3>
            {testSummary && (
              <div className="flex gap-4 mb-3 text-xs">
                <span className="text-gray-600">{dm.total || '总计'}: {testSummary.total}</span>
                <span className="text-green-600">{dm.passedCount || '通过'}: {testSummary.passed}</span>
                <span className="text-red-600">{dm.failedCount || '失败'}: {testSummary.failed}</span>
                <span className="text-blue-600">{dm.passRate || '通过率'}: {testSummary.passRate}</span>
              </div>
            )}
            {testResults.length > 0 ? (
              <div className="space-y-2">
                {testResults.map((result, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-xs p-2 rounded bg-gray-50">
                    <span className={`w-2 h-2 rounded-full ${result.pass ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-medium text-gray-700 w-24">{result.name}</span>
                    <span className={result.pass ? 'text-green-600' : 'text-red-600'}>
                      {result.pass ? (dm.passResult || '通过') : (dm.failResult || '失败')}
                    </span>
                    <span className="text-gray-500">{result.detail}</span>
                    {result.value !== undefined && (
                      <span className="font-mono text-gray-700">{result.value}{result.unit ? ' ' + result.unit : ''}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">{dm.noTestResults || '暂无测试结果'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
