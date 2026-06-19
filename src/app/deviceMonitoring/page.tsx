'use client';

import { useState, useEffect, useRef } from 'react';
import { useDevice } from '@/lib/device/context';
import { useI18n } from '@/lib/i18n/context';

interface SensorRecord {
  timestamp: string;
  // Temperature & Battery (from custom GET)
  temperature: string;
  batteryVoltage: string;
  // High Shock (g)
  highShockCM: string;
  // Low Shock (g)
  lowShockCM: string;
  lowShockEM: string;
  // Pressure (psi)
  pressureCM: string;
  pressureEM: string;
  // Rotational (rpm)
  rotationalCM: string;
  rotationalEM: string;
  // Additional sensors
  temperatureEM: string;
  limpetEM: string;
  flashTest: string;
  pressureSelfTest: string;
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
    temperatureEM: false,
    limpet: false,
    flashTest: false,
    pressureSelfTest: false,
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
              highShockCM: data.highShockCM || '--',
              lowShockCM: data.lowShockCM || '--',
              lowShockEM: data.lowShockEM || '--',
              pressureCM: data.pressureCM || '--',
              pressureEM: data.pressureEM || '--',
              rotationalCM: data.rotationalCM || '--',
              rotationalEM: data.rotationalEM || '--',
              temperatureEM: data.temperatureEM || '--',
              limpetEM: data.limpetEM || '--',
              flashTest: data.flashTest || '--',
              pressureSelfTest: data.pressureSelfTest || '--',
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
    // Match original Procyon software CSV format
    // Export separate CSVs per sensor group, then a combined one
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility

    // Temperature CSV (like original)
    const tempHeaders = ['Timestamp', 'Temperature'];
    const tempRows = sensorRecords
      .filter(r => r.temperature !== '--')
      .map(r => [r.timestamp, r.temperature].join(','));
    const tempCsv = BOM + [tempHeaders.join(','), ...tempRows].join('\n');

    // Battery CSV
    const battHeaders = ['Timestamp', 'Battery_mV'];
    const battRows = sensorRecords
      .filter(r => r.batteryVoltage !== '--')
      .map(r => [r.timestamp, r.batteryVoltage].join(','));
    const battCsv = BOM + [battHeaders.join(','), ...battRows].join('\n');

    // High Shock CSV (single value - GET command only returns aggregate)
    const hsHeaders = ['Timestamp', 'highShock_g'];
    const hsRows = sensorRecords
      .filter(r => r.highShockCM !== '--')
      .map(r => [r.timestamp, r.highShockCM].join(','));
    const hsCsv = BOM + [hsHeaders.join(','), ...hsRows].join('\n');

    // Low Shock CSV (CM + EM)
    const lsHeaders = ['Timestamp', 'lowShockCM_g', 'lowShockEM_g'];
    const lsRows = sensorRecords
      .filter(r => r.lowShockCM !== '--' || r.lowShockEM !== '--')
      .map(r => [r.timestamp, r.lowShockCM, r.lowShockEM].join(','));
    const lsCsv = BOM + [lsHeaders.join(','), ...lsRows].join('\n');

    // Pressure CSV (CM + EM)
    const prHeaders = ['Timestamp', 'psi_CM', 'psi_EM'];
    const prRows = sensorRecords
      .filter(r => r.pressureCM !== '--' || r.pressureEM !== '--')
      .map(r => [r.timestamp, r.pressureCM, r.pressureEM].join(','));
    const prCsv = BOM + [prHeaders.join(','), ...prRows].join('\n');

    // Rotational CSV (CM + EM)
    const rotHeaders = ['Timestamp', 'rpm_CM', 'rpm_EM'];
    const rotRows = sensorRecords
      .filter(r => r.rotationalCM !== '--' || r.rotationalEM !== '--')
      .map(r => [r.timestamp, r.rotationalCM, r.rotationalEM].join(','));
    const rotCsv = BOM + [rotHeaders.join(','), ...rotRows].join('\n');

    // Combined full CSV
    const allHeaders = [
      'Timestamp', 'Temperature_C', 'Battery_mV',
      'HighShock_CM_g', 'LowShock_CM_g', 'LowShock_EM_g',
      'Pressure_CM_psi', 'Pressure_EM_psi',
      'Rotational_CM_rpm', 'Rotational_EM_rpm',
      'Temperature_EM_C', 'Limpet_EM', 'FlashTest', 'PressureSelfTest',
    ];
    const allRows = sensorRecords.map(r => [
      r.timestamp, r.temperature, r.batteryVoltage,
      r.highShockCM, r.lowShockCM, r.lowShockEM,
      r.pressureCM, r.pressureEM,
      r.rotationalCM, r.rotationalEM,
      r.temperatureEM, r.limpetEM, r.flashTest, r.pressureSelfTest,
    ].join(','));
    const allCsv = BOM + [allHeaders.join(','), ...allRows].join('\n');

    // Download all files
    const files = [
      { name: 'monitoring_temperature.csv', content: tempCsv },
      { name: 'monitoring_battery.csv', content: battCsv },
      { name: 'monitoring_highShock.csv', content: hsCsv },
      { name: 'monitoring_lowShock.csv', content: lsCsv },
      { name: 'monitoring_pressure.csv', content: prCsv },
      { name: 'monitoring_rotational.csv', content: rotCsv },
      { name: 'monitoring_all_data.csv', content: allCsv },
    ];

    files.forEach((file, idx) => {
      setTimeout(() => {
        const blob = new Blob([file.content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
      }, idx * 300);
    });
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
                    <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{dm.timestamp || '时间'}</th>
                    {visibleSensors.temperature && (
                      <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.temperature || '温度'} (°C)</th>
                    )}
                    {visibleSensors.battery && (
                      <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.batteryVoltage || '电池'} (mV)</th>
                    )}
                    {visibleSensors.highShock && (
                      <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.highShock || '高冲击'} CM(g)</th>
                    )}
                    {visibleSensors.lowShock && (
                      <>
                        <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.lowShockCM || '低冲击'} CM(g)</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.lowShockCM || '低冲击'} EM(g)</th>
                      </>
                    )}
                    {visibleSensors.pressure && (
                      <>
                        <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.pressureCM || '压力'} CM(psi)</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.pressureCM || '压力'} EM(psi)</th>
                      </>
                    )}
                    {visibleSensors.rotational && (
                      <>
                        <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.rotational || '旋转'} CM(rpm)</th>
                        <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.rotational || '旋转'} EM(rpm)</th>
                      </>
                    )}
                    {visibleSensors.temperatureEM && (
                      <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.temperature || '温度'} EM(°C)</th>
                    )}
                    {visibleSensors.limpet && (
                      <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Limpet EM</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sensorRecords.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="px-3 py-8 text-center text-gray-400">
                        {isMonitoring
                          ? (dm.waitingData || '等待数据...')
                          : (dm.clickStart || '点击"开始监控"获取实时数据')}
                      </td>
                    </tr>
                  ) : (
                    sensorRecords.map((record, idx) => (
                      <tr key={idx} className={idx === 0 ? 'bg-blue-50' : ''}>
                        <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-mono">{record.timestamp}</td>
                        {visibleSensors.temperature && (
                          <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.temperature}</td>
                        )}
                        {visibleSensors.battery && (
                          <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.batteryVoltage}</td>
                        )}
                        {visibleSensors.highShock && (
                          <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.highShockCM}</td>
                        )}
                        {visibleSensors.lowShock && (
                          <>
                            <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.lowShockCM}</td>
                            <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.lowShockEM}</td>
                          </>
                        )}
                        {visibleSensors.pressure && (
                          <>
                            <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.pressureCM}</td>
                            <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.pressureEM}</td>
                          </>
                        )}
                        {visibleSensors.rotational && (
                          <>
                            <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.rotationalCM}</td>
                            <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.rotationalEM}</td>
                          </>
                        )}
                        {visibleSensors.temperatureEM && (
                          <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.temperatureEM}</td>
                        )}
                        {visibleSensors.limpet && (
                          <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.limpetEM}</td>
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
                  temperatureEM: (dm.temperature || '温度') + ' EM',
                  limpet: 'Limpet',
                  flashTest: 'Flash',
                  pressureSelfTest: (dm.pressureLabel || '压力') + ' 自检',
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
