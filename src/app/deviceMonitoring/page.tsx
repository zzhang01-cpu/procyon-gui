'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDevice } from '@/lib/device/context';
import { useI18n } from '@/lib/i18n/context';
import { saveRecordsCsv as usbSaveRecordsCsv } from '@/lib/usb/procyon';

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
  const [downloadRecordCount, setDownloadRecordCount] = useState(0);
  const [csvFilePath, setCsvFilePath] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setDebugLog(prev => [...prev.slice(-15), `[${ts}] ${msg}`]);
    console.log('[MonitorPage]', msg);
  };

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
    setDownloadRecordCount(0);
    setCsvFilePath(null);
    setDebugLog([]);
    try {
      addLog('开始下载数据...');
      const result = await downloadData();
      addLog('下载完成: success=' + String(result?.success) + ', error=' + String(result?.error));
      // Log partition debug info (CMD responses)
      const partDebug = result?.partitionDebug as string[] | undefined;
      if (partDebug && partDebug.length > 0) {
        for (const dbg of partDebug) {
          addLog('  [CMD] ' + dbg);
        }
      }
      // Log partition details
      if (result?.partitions) {
        for (let pi = 0; pi < result.partitions.length; pi++) {
          const p = result.partitions[pi] as Record<string, unknown>;
          const pData = p?.data as unknown;
          const dataSize = pData ? (Array.isArray(pData) ? (pData as unknown[]).length : ((pData as Record<string, unknown>)?.length as number || 0)) : 0;
          const bufSize = (p?.size as number) || 0;
          const wc = (p?.writtenChunks as number) ?? '?';
          const tc = (p?.totalChunks as number) ?? '?';
          const cr = (p?.chunksRead as number) ?? '?';
          addLog('  分区' + String(p?.partition || pi) + ': size=' + String(bufSize) + ', writtenChunks=' + String(wc) + ', totalChunks=' + String(tc) + ', chunksRead=' + String(cr));
        }
      }
      if (!result?.success) {
        const errMsg = result?.error || String(dm.downloadFailed || '下载失败');
        addLog('下载失败: ' + errMsg);
        setDownloadError(errMsg);
      } else {
        const recordCount = (result as any).recordCount || 0;
        const savedPath = (result as any).csvFilePath || null;
        setDownloadRecordCount(recordCount);
        setCsvFilePath(savedPath);
        addLog('下载成功! ' + recordCount.toLocaleString() + ' 条记录' + (savedPath ? ', CSV已保存: ' + savedPath : ''));
        // Show parse debug info from main process
        const parseDebugInfo = (result as any).partitionDebugInfo;
        if (parseDebugInfo && Array.isArray(parseDebugInfo)) {
          for (const line of parseDebugInfo) {
            addLog('  ' + String(line));
          }
        }
      }
    } catch (err) {
      addLog('下载异常: ' + (err instanceof Error ? err.message : String(err)));
      setDownloadError(err instanceof Error ? err.message : String(dm.downloadFailed || '下载失败'));
    } finally {
      setIsDownloading(false);
    }
  }, [connected, downloadData, dm.downloadFailed, dm.downloading, t.errors]);

  // Manual CSV save button
  const handleSaveCSV = async () => {
    try {
      const result = await usbSaveRecordsCsv('Procyon_Data_' + new Date().toISOString().slice(0, 10) + '.csv');
      if (result && (result as any).success !== false) {
        setCsvFilePath((result as any).filePath);
        addLog('CSV已保存: ' + (result as any).filePath);
      } else {
        addLog('CSV保存失败: ' + ((result as any).error || 'unknown'));
      }
    } catch (err) {
      addLog('CSV保存异常: ' + (err instanceof Error ? err.message : ''));
    }
  };

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

  const batteryMv = deviceInfo?.batteryVoltage;

  // Render download section
  const renderDownloadSection = () => {
    if (isDownloading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center py-16">
          <div className="animate-spin w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full mb-4" />
          <p className="text-sm font-medium text-blue-600 mb-2">{dm.downloading || '正在下载数据...'}</p>
          {downloadProgress ? (
            <div className="w-80">
              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: Math.min(100, ((downloadProgress.partition - 1) / downloadProgress.totalPartitions * 100 + (downloadProgress.chunksRead || 0) / Math.max(1, downloadProgress.totalChunks || 100) / downloadProgress.totalPartitions * 100)) + '%' }}
                />
              </div>
              <p className="text-xs text-gray-600 text-center mb-1">
                分区 {downloadProgress.partition}/{downloadProgress.totalPartitions}
              </p>
              <p className="text-xs text-gray-500 text-center mb-1">
                数据块: {downloadProgress.chunksRead || downloadProgress.chunk || 0}
                {downloadProgress.bytesDownloaded ? (
                  <> ({(downloadProgress.bytesDownloaded / 1024).toFixed(1)} KB)</>
                ) : null}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-400">正在连接设备，请稍候...</p>
          )}
        </div>
      );
    }

    // Download complete - show result
    if (downloadRecordCount > 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <svg className="w-16 h-16 mb-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-lg font-semibold text-green-700 mb-1">
            下载成功
          </p>
          <p className="text-sm text-gray-600 mb-1">
            {downloadRecordCount.toLocaleString()} 条 OneSecond 记录
          </p>
          {csvFilePath && (
            <p className="text-xs text-gray-500 mb-4 font-mono break-all max-w-lg text-center">
              CSV 已保存: {csvFilePath}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleSaveCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              重新保存CSV
            </button>
            <button
              onClick={() => { setDownloadRecordCount(0); setCsvFilePath(null); }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
            >
              清除
            </button>
          </div>
        </div>
      );
    }

    // No data yet - show download button
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
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {dm.startDownload || '下载数据'}
        </button>
        {downloadError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg max-w-lg text-center">
            <p className="text-sm font-semibold text-red-700 mb-1">下载失败</p>
            <p className="text-xs text-red-600 break-all">{downloadError}</p>
          </div>
        )}
        {!connected && (
          <p className="text-xs text-amber-500 mt-2">请先连接设备</p>
        )}
      </div>
    );
  };

  // Render polling data table
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
          {/* Left: Data Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Controls bar */}
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

              {dataSource === 'downloaded' && !isDownloading && downloadRecordCount === 0 && (
                <button
                  onClick={handleDownload}
                  disabled={!connected}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {dm.startDownload || '下载数据'}
                </button>
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
              {downloadError && <span className="text-xs text-red-600 font-medium ml-2">下载失败: {downloadError}</span>}
            </div>

            {/* Data display area */}
            {dataSource === 'downloaded' ? renderDownloadSection() : renderPollingTable()}

            {/* Debug log */}
            {debugLog.length > 0 && (
              <div className="mt-3 p-3 bg-gray-100 border border-gray-200 rounded-lg">
                <p className="text-xs font-semibold text-gray-600 mb-1">调试日志:</p>
                <div className="text-xs text-gray-500 font-mono space-y-0.5 max-h-32 overflow-y-auto">
                  {debugLog.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
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
