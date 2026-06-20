'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDevice } from '@/lib/device/context';
import { useI18n } from '@/lib/i18n/context';
import type { OneSecondRecord } from '@/lib/usb/procyon';

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
    downloadedData,
    downloadData,
    downloadProgress,
    clearData,
    exportData,
  } = useDevice();
  const { t } = useI18n();
  const dm = t.deviceMonitoring;

  const [activeTab, setActiveTab] = useState<'realtime' | 'system'>('realtime');
  const [dataSource, setDataSource] = useState<'downloaded' | 'polling'>('downloaded');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [pollRecords, setPollRecords] = useState<Record<string, string>[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);

  // Download state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Visible sensor groups (for downloaded data view)
  const [visibleGroups, setVisibleGroups] = useState({
    temperature: true,
    battery: true,
    highShock: true,
    lowShock: true,
    pressure: true,
    rotational: true,
    shockLateral: false,
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

  const selfTestItems = [
    'Temperature', 'Battery', 'HighShock', 'LowShock',
    'Pressure', 'Rotational', 'Limpet', 'Flash',
  ];

  // Real-time polling
  useEffect(() => {
    if (!isMonitoring || !connected || dataSource !== 'polling') {
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
          setPollRecords(prev => {
            const newRecord: Record<string, string> = {
              timestamp: ts,
              temperature: data.temperatureCM != null ? String(data.temperatureCM) : 'N/A',
              batteryVoltage: data.batteryVoltage != null ? String(data.batteryVoltage) : 'N/A',
              // Multi-axis sensor data from getSensorData (Float32 values)
              rpmX_min: data.rpmX_min || 'N/A', rpmX_max: data.rpmX_max || 'N/A', rpmX_avg: data.rpmX_avg || 'N/A', rpmX_rms: data.rpmX_rms || 'N/A',
              rpmY_min: data.rpmY_min || 'N/A', rpmY_max: data.rpmY_max || 'N/A', rpmY_avg: data.rpmY_avg || 'N/A', rpmY_rms: data.rpmY_rms || 'N/A',
              rpmZ_min: data.rpmZ_min || 'N/A', rpmZ_max: data.rpmZ_max || 'N/A', rpmZ_avg: data.rpmZ_avg || 'N/A', rpmZ_rms: data.rpmZ_rms || 'N/A',
              highShockX_min: data.highShockX_min || 'N/A', highShockX_max: data.highShockX_max || 'N/A', highShockX_avg: data.highShockX_avg || 'N/A', highShockX_rms: data.highShockX_rms || 'N/A',
              highShockY_min: data.highShockY_min || 'N/A', highShockY_max: data.highShockY_max || 'N/A', highShockY_avg: data.highShockY_avg || 'N/A', highShockY_rms: data.highShockY_rms || 'N/A',
              highShockZ_min: data.highShockZ_min || 'N/A', highShockZ_max: data.highShockZ_max || 'N/A', highShockZ_avg: data.highShockZ_avg || 'N/A', highShockZ_rms: data.highShockZ_rms || 'N/A',
              lowShockX_min: data.lowShockX_min || 'N/A', lowShockX_max: data.lowShockX_max || 'N/A', lowShockX_avg: data.lowShockX_avg || 'N/A', lowShockX_rms: data.lowShockX_rms || 'N/A',
              lowShockY_min: data.lowShockY_min || 'N/A', lowShockY_max: data.lowShockY_max || 'N/A', lowShockY_avg: data.lowShockY_avg || 'N/A', lowShockY_rms: data.lowShockY_rms || 'N/A',
              lowShockZ_min: data.lowShockZ_min || 'N/A', lowShockZ_max: data.lowShockZ_max || 'N/A', lowShockZ_avg: data.lowShockZ_avg || 'N/A', lowShockZ_rms: data.lowShockZ_rms || 'N/A',
              psi_min: data.psi_min || 'N/A', psi_max: data.psi_max || 'N/A', psi_avg: data.psi_avg || 'N/A',
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
  }, [isMonitoring, connected, getSensorData, dm.pollFailed, dataSource]);

  // Download data handler
  const handleDownload = useCallback(async () => {
    if (!connected) {
      alert(String(t.errors?.deviceNotFound || '设备未连接'));
      return;
    }
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const result = await downloadData();
      if (!result?.success) {
        setDownloadError(result?.error || String(dm.downloadFailed || '下载失败'));
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(dm.downloadFailed || '下载失败'));
    } finally {
      setIsDownloading(false);
    }
  }, [connected, downloadData, dm.downloadFailed, t.errors]);

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
      prev.includes(test) ? prev.filter(t2 => t2 !== test) : [...prev, test]
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

  const toggleGroup = (key: keyof typeof visibleGroups) => {
    setVisibleGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Format number with fixed decimal places
  const fmt = (val: number | undefined | null, decimals: number = 2): string => {
    if (val == null || isNaN(val)) return 'N/A';
    return val.toFixed(decimals);
  };

  // CSV export for downloaded data - match original Procyon software format
  const exportDownloadedCSV = () => {
    if (downloadedData.length === 0) return;
    const BOM = '\uFEFF';

    // Temperature CSV (like original: Timestamp, Temperature)
    const tempCsv = BOM + [
      'Timestamp,Temperature',
      ...downloadedData.map(r => `${r.timestamp},${fmt(r.temperature, 4)}`)
    ].join('\n');

    // Battery CSV
    const battCsv = BOM + [
      'Timestamp,Battery_mV',
      ...downloadedData.map(r => `${r.timestamp},${fmt(r.batteryVoltage, 0)}`)
    ].join('\n');

    // HighShock CSV - X/Y/Z min/max/avg/rms (like original)
    const hsHeaders = 'Timestamp,highShockX_min,highShockX_max,highShockX_avg,highShockX_rms,highShockY_min,highShockY_max,highShockY_avg,highShockY_rms,highShockZ_min,highShockZ_max,highShockZ_avg,highShockZ_rms';
    const hsCsv = BOM + [
      hsHeaders,
      ...downloadedData.map(r => [
        r.timestamp,
        fmt(r.shockMinX), fmt(r.shockMaxX), fmt(r.shockAvgX), fmt(r.shockRmsX),
        fmt(r.shockMinY), fmt(r.shockMaxY), fmt(r.shockAvgY), fmt(r.shockRmsY),
        fmt(r.shockMinZ), fmt(r.shockMaxZ), fmt(r.shockAvgZ), fmt(r.shockRmsZ),
      ].join(','))
    ].join('\n');

    // LowShock CSV - X/Y/Z min/max/avg/rms (like original)
    const lsHeaders = 'Timestamp,lowShockX_min,lowShockX_max,lowShockX_avg,lowShockX_rms,lowShockY_min,lowShockY_max,lowShockY_avg,lowShockY_rms,lowShockZ_min,lowShockZ_max,lowShockZ_avg,lowShockZ_rms';
    const lsCsv = BOM + [
      lsHeaders,
      ...downloadedData.map(r => [
        r.timestamp,
        fmt(r.shockLowMinX), fmt(r.shockLowMaxX), fmt(r.shockLowAvgX), fmt(r.shockLowRmsX),
        fmt(r.shockLowMinY), fmt(r.shockLowMaxY), fmt(r.shockLowAvgY), fmt(r.shockLowRmsY),
        fmt(r.shockLowMinZ), fmt(r.shockLowMaxZ), fmt(r.shockLowAvgZ), fmt(r.shockLowRmsZ),
      ].join(','))
    ].join('\n');

    // Pressure CSV (like original: psi_min, psi_max, psi_avg)
    const prCsv = BOM + [
      'Timestamp,psi_min,psi_max,psi_avg',
      ...downloadedData.map(r => [
        r.timestamp, fmt(r.pressure), fmt(r.pressure), fmt(r.pressure)
      ].join(','))
    ].join('\n');

    // Rotational CSV - X/Y/Z min/max/avg/rms (like original)
    const rotHeaders = 'Timestamp,rpmX_min,rpmX_max,rpmX_avg,rpmX_rms,rpmY_min,rpmY_max,rpmY_avg,rpmY_rms,rpmZ_min,rpmZ_max,rpmZ_avg,rpmZ_rms';
    const rotCsv = BOM + [
      rotHeaders,
      ...downloadedData.map(r => [
        r.timestamp,
        fmt(r.rpmMinX), fmt(r.rpmMaxX), fmt(r.rpmAvgX), fmt(r.rpmRmsX),
        fmt(r.rpmMinY), fmt(r.rpmMaxY), fmt(r.rpmAvgY), fmt(r.rpmRmsY),
        fmt(r.rpmMinZ), fmt(r.rpmMaxZ), fmt(r.rpmAvgZ), fmt(r.rpmRmsZ),
      ].join(','))
    ].join('\n');

    // Combined all data CSV
    const allHeaders = [
      'Timestamp', 'Temperature', 'Battery_mV',
      'highShockX_min', 'highShockX_max', 'highShockX_avg', 'highShockX_rms',
      'highShockY_min', 'highShockY_max', 'highShockY_avg', 'highShockY_rms',
      'highShockZ_min', 'highShockZ_max', 'highShockZ_avg', 'highShockZ_rms',
      'shockLateralMax', 'shockLateralRms',
      'lowShockX_min', 'lowShockX_max', 'lowShockX_avg', 'lowShockX_rms',
      'lowShockY_min', 'lowShockY_max', 'lowShockY_avg', 'lowShockY_rms',
      'lowShockZ_min', 'lowShockZ_max', 'lowShockZ_avg', 'lowShockZ_rms',
      'rpmX_min', 'rpmX_max', 'rpmX_avg', 'rpmX_rms',
      'rpmY_min', 'rpmY_max', 'rpmY_avg', 'rpmY_rms',
      'rpmZ_min', 'rpmZ_max', 'rpmZ_avg', 'rpmZ_rms',
      'psi_avg',
    ];
    const allCsv = BOM + [
      allHeaders.join(','),
      ...downloadedData.map(r => [
        r.timestamp, fmt(r.temperature, 4), fmt(r.batteryVoltage, 0),
        fmt(r.shockMinX), fmt(r.shockMaxX), fmt(r.shockAvgX), fmt(r.shockRmsX),
        fmt(r.shockMinY), fmt(r.shockMaxY), fmt(r.shockAvgY), fmt(r.shockRmsY),
        fmt(r.shockMinZ), fmt(r.shockMaxZ), fmt(r.shockAvgZ), fmt(r.shockRmsZ),
        fmt(r.shockLateralMax), fmt(r.shockLateralRms),
        fmt(r.shockLowMinX), fmt(r.shockLowMaxX), fmt(r.shockLowAvgX), fmt(r.shockLowRmsX),
        fmt(r.shockLowMinY), fmt(r.shockLowMaxY), fmt(r.shockLowAvgY), fmt(r.shockLowRmsY),
        fmt(r.shockLowMinZ), fmt(r.shockLowMaxZ), fmt(r.shockLowAvgZ), fmt(r.shockLowRmsZ),
        fmt(r.rpmMinX), fmt(r.rpmMaxX), fmt(r.rpmAvgX), fmt(r.rpmRmsX),
        fmt(r.rpmMinY), fmt(r.rpmMaxY), fmt(r.rpmAvgY), fmt(r.rpmRmsY),
        fmt(r.rpmMinZ), fmt(r.rpmMaxZ), fmt(r.rpmAvgZ), fmt(r.rpmRmsZ),
        fmt(r.pressure),
      ].join(','))
    ].join('\n');

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

  // CSV export for polling data (simpler format)
  const exportPollingCSV = () => {
    if (pollRecords.length === 0) return;
    const BOM = '\uFEFF';
    const headers = Object.keys(pollRecords[0]);
    const csv = BOM + [
      headers.join(','),
      ...pollRecords.map(r => headers.map(h => r[h] || 'N/A').join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'monitoring_realtime.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export using context's exportData (full format from procyon.ts)
  const handleExportFullCSV = () => {
    const csv = exportData();
    if (!csv) return;
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'procyon_data.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const batteryMv = deviceInfo?.batteryVoltage;

  // Render OneSecondRecord data table
  const renderDownloadedTable = () => {
    if (downloadedData.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-gray-400">
          <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <p className="text-sm mb-2">{dm.noData || '暂无数据'}</p>
          <p className="text-xs mb-4">{dm.downloadFirst || '请先从设备下载数据'}</p>
          <button
            onClick={handleDownload}
            disabled={!connected || isDownloading}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isDownloading ? (dm.downloading || '下载中...') : (dm.startDownload || '下载数据')}
          </button>
          {downloadError && (
            <p className="text-xs text-red-500 mt-3 max-w-md text-center">{downloadError}</p>
          )}
          {isDownloading && downloadProgress && (
            <p className="text-xs text-blue-500 mt-2">
              {dm.chunkProgress || '进度'}: Partition {downloadProgress.partition}/{downloadProgress.totalPartitions}, Chunk {downloadProgress.chunk}/{downloadProgress.totalChunks}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 text-left font-semibold text-gray-700 whitespace-nowrap border-b border-r border-gray-200 sticky left-0 bg-gray-50 z-20">
                {dm.timestamp || '时间戳'}
              </th>
              {visibleGroups.temperature && (
                <th className="px-2 py-2 text-center font-semibold text-blue-700 whitespace-nowrap border-b border-r border-gray-200 bg-blue-50">
                  {dm.temperature || '温度'} (°C)
                </th>
              )}
              {visibleGroups.battery && (
                <th className="px-2 py-2 text-center font-semibold text-green-700 whitespace-nowrap border-b border-r border-gray-200 bg-green-50">
                  {dm.batteryVoltage || '电池'} (mV)
                </th>
              )}
              {visibleGroups.highShock && (
                <>
                  <th colSpan={12} className="px-2 py-1 text-center font-semibold text-red-700 border-b border-gray-200 bg-red-50 text-xs">
                    {dm.highShockLabel || '高冲击'} (g)
                  </th>
                </>
              )}
              {visibleGroups.lowShock && (
                <th colSpan={12} className="px-2 py-1 text-center font-semibold text-yellow-700 border-b border-gray-200 bg-yellow-50 text-xs">
                  {dm.lowShockLabel || '低冲击'} (g)
                </th>
              )}
              {visibleGroups.rotational && (
                <th colSpan={12} className="px-2 py-1 text-center font-semibold text-purple-700 border-b border-gray-200 bg-purple-50 text-xs">
                  {dm.rotational || '旋转'} (rpm)
                </th>
              )}
              {visibleGroups.pressure && (
                <th className="px-2 py-2 text-center font-semibold text-cyan-700 whitespace-nowrap border-b border-r border-gray-200 bg-cyan-50">
                  {dm.pressureLabel || '压力'} (psi)
                </th>
              )}
            </tr>
            {/* Sub-headers for X/Y/Z min/max/avg/rms */}
            <tr>
              <th className="px-2 py-1 border-b border-r border-gray-200 sticky left-0 bg-gray-50 z-20"></th>
              {visibleGroups.temperature && <th className="px-1 py-1 border-b border-r border-gray-200 bg-blue-50/50"></th>}
              {visibleGroups.battery && <th className="px-1 py-1 border-b border-r border-gray-200 bg-green-50/50"></th>}
              {visibleGroups.highShock && (
                ['X', 'Y', 'Z'].map(axis => (
                  ['min', 'max', 'avg', 'rms'].map(stat => (
                    <th key={`hs-${axis}-${stat}`} className="px-1 py-1 text-center font-normal text-gray-600 whitespace-nowrap border-b border-r border-gray-200 bg-red-50/30 text-[10px]">
                      {axis}_{stat}
                    </th>
                  ))
                )).flat()
              )}
              {visibleGroups.lowShock && (
                ['X', 'Y', 'Z'].map(axis => (
                  ['min', 'max', 'avg', 'rms'].map(stat => (
                    <th key={`ls-${axis}-${stat}`} className="px-1 py-1 text-center font-normal text-gray-600 whitespace-nowrap border-b border-r border-gray-200 bg-yellow-50/30 text-[10px]">
                      {axis}_{stat}
                    </th>
                  ))
                )).flat()
              )}
              {visibleGroups.rotational && (
                ['X', 'Y', 'Z'].map(axis => (
                  ['min', 'max', 'avg', 'rms'].map(stat => (
                    <th key={`rot-${axis}-${stat}`} className="px-1 py-1 text-center font-normal text-gray-600 whitespace-nowrap border-b border-r border-gray-200 bg-purple-50/30 text-[10px]">
                      {axis}_{stat}
                    </th>
                  ))
                )).flat()
              )}
              {visibleGroups.pressure && <th className="px-1 py-1 border-b border-r border-gray-200 bg-cyan-50/50"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {downloadedData.map((record, idx) => (
              <tr key={idx} className={idx === 0 ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'}>
                <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-mono border-r border-gray-100 sticky left-0 bg-white">
                  {record.timestamp}
                </td>
                {visibleGroups.temperature && (
                  <td className="px-2 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">
                    {fmt(record.temperature, 4)}
                  </td>
                )}
                {visibleGroups.battery && (
                  <td className="px-2 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">
                    {fmt(record.batteryVoltage, 0)}
                  </td>
                )}
                {visibleGroups.highShock && (
                  <>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockMinX)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockMaxX)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockAvgX)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockRmsX)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockMinY)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockMaxY)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockAvgY)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockRmsY)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockMinZ)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockMaxZ)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockAvgZ)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockRmsZ)}</td>
                  </>
                )}
                {visibleGroups.lowShock && (
                  <>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowMinX, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowMaxX, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowAvgX, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowRmsX, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowMinY, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowMaxY, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowAvgY, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowRmsY, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowMinZ, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowMaxZ, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowAvgZ, 4)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.shockLowRmsZ, 4)}</td>
                  </>
                )}
                {visibleGroups.rotational && (
                  <>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmMinX)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmMaxX)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmAvgX)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmRmsX)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmMinY)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmMaxY)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmAvgY)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmRmsY)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmMinZ)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmMaxZ)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmAvgZ)}</td>
                    <td className="px-1.5 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">{fmt(record.rpmRmsZ)}</td>
                  </>
                )}
                {visibleGroups.pressure && (
                  <td className="px-2 py-1.5 text-center font-mono text-gray-700 border-r border-gray-100">
                    {fmt(record.pressure)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render polling data table (simpler, single values)
  const renderPollingTable = () => {
    if (pollRecords.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center py-16 text-gray-400 text-sm">
          {isMonitoring ? (dm.waitingData || '等待数据...') : (dm.clickStart || '点击"开始监控"获取实时数据')}
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{dm.timestamp || '时间'}</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.temperature || '温度'} (°C)</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{dm.batteryVoltage || '电池'} (mV)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pollRecords.map((record, idx) => (
              <tr key={idx} className={idx === 0 ? 'bg-blue-50' : ''}>
                <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-mono">{record.timestamp}</td>
                <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.temperature}</td>
                <td className="px-2 py-1.5 text-center text-gray-700 font-mono">{record.batteryVoltage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

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
          {/* Left: Sensor Data */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Data Source Switch + Controls */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              {/* Data Source Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    dataSource === 'downloaded' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                  }`}
                  onClick={() => setDataSource('downloaded')}
                >
                  {dm.downloadedData || '下载数据'}
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    dataSource === 'polling' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                  }`}
                  onClick={() => setDataSource('polling')}
                >
                  {dm.instantPolling || '实时轮询'}
                </button>
              </div>

              {dataSource === 'downloaded' && (
                <>
                  <button
                    onClick={handleDownload}
                    disabled={!connected || isDownloading}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? (dm.downloading || '下载中...') : (dm.startDownload || '下载数据')}
                  </button>
                  {downloadProgress && (
                    <span className="text-xs text-blue-600">
                      {dm.chunkProgress || '进度'}: {downloadProgress.chunk}/{downloadProgress.totalChunks}
                    </span>
                  )}
                  {downloadedData.length > 0 && (
                    <>
                      <span className="text-xs text-gray-500">
                        {downloadedData.length} {dm.records || '条记录'}
                      </span>
                      <button
                        onClick={exportDownloadedCSV}
                        className="ml-auto px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        {dm.exportCSV || '导出CSV'}
                      </button>
                      <button
                        onClick={handleExportFullCSV}
                        className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                      >
                        {dm.exportFullCSV || '导出全量CSV'}
                      </button>
                      <button
                        onClick={clearData}
                        className="px-3 py-1.5 text-xs bg-gray-400 text-white rounded hover:bg-gray-500"
                      >
                        {dm.clearData || '清除数据'}
                      </button>
                    </>
                  )}
                </>
              )}

              {dataSource === 'polling' && (
                <>
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
                  {pollRecords.length > 0 && (
                    <button
                      onClick={exportPollingCSV}
                      className="ml-auto px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      {dm.exportCSV || '导出CSV'}
                    </button>
                  )}
                </>
              )}

              {pollError && <span className="text-xs text-red-500 ml-2">{pollError}</span>}
              {downloadError && <span className="text-xs text-red-500 ml-2">{downloadError}</span>}
            </div>

            {/* Data Table */}
            {dataSource === 'downloaded' ? renderDownloadedTable() : renderPollingTable()}

            {/* Sensor Visibility Toggles (only for downloaded data) */}
            {dataSource === 'downloaded' && downloadedData.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
                {(Object.keys(visibleGroups) as Array<keyof typeof visibleGroups>).map(key => {
                  const labelMap: Record<string, string> = {
                    temperature: dm.temperature || '温度',
                    battery: dm.batteryVoltage || '电池',
                    highShock: dm.highShockLabel || '高冲击',
                    lowShock: dm.lowShockLabel || '低冲击',
                    pressure: dm.pressureLabel || '压力',
                    rotational: dm.rotational || '旋转',
                    shockLateral: dm.shockLateral || '横向冲击',
                  };
                  return (
                    <label key={key} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleGroups[key]}
                        onChange={() => toggleGroup(key)}
                        className="rounded border-gray-300"
                      />
                      {labelMap[key] || key}
                    </label>
                  );
                })}
              </div>
            )}
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
                    <span className="font-medium text-gray-700">{result.name}</span>
                    <span className={result.pass ? 'text-green-600' : 'text-red-600'}>
                      {result.pass ? (dm.passed || '通过') : (dm.failed || '失败')}
                    </span>
                    {result.detail && <span className="text-gray-500">- {result.detail}</span>}
                    {result.value != null && (
                      <span className="font-mono text-gray-600">
                        {result.value}{result.unit ? ' ' + result.unit : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">{dm.noTestResults || '暂无测试结果'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
