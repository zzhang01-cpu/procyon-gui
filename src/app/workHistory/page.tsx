'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';

type SensorGroup = 'temperature' | 'battery' | 'pressure' | 'highShock' | 'lowShock' | 'rotational';

export default function WorkHistoryPage() {
  const { t } = useI18n();
  const { downloadedData, downloadResult, exportData, clearData } = useDevice();
  const wh = t.workHistory;

  const [expandedGroups, setExpandedGroups] = useState<Record<SensorGroup, boolean>>({
    temperature: true,
    battery: true,
    pressure: true,
    highShock: true,
    lowShock: true,
    rotational: true,
  });
  const [visibleGroups, setVisibleGroups] = useState<Record<SensorGroup, boolean>>({
    temperature: true,
    battery: true,
    pressure: true,
    highShock: true,
    lowShock: true,
    rotational: true,
  });

  const toggleExpand = (group: SensorGroup) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const toggleVisible = (group: SensorGroup) => {
    setVisibleGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const handleExport = async () => {
    const csv = await exportData();
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'procyon_all_data.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportGroup = (group: SensorGroup) => {
    if (downloadedData.length === 0) return;
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    let headers: string[] = ['Timestamp'];
    let rows: string[][];

    switch (group) {
      case 'temperature':
        headers = ['Timestamp', 'Temperature'];
        rows = downloadedData.map(r => [r.timestamp, r.temperature.toFixed(4)]);
        break;
      case 'battery':
        headers = ['Timestamp', 'BatteryV'];
        rows = downloadedData.map(r => [r.timestamp, r.batteryVoltage.toFixed(0)]);
        break;
      case 'highShock':
        // Match original software format: highShockX_min, highShockX_max, etc.
        headers = ['Timestamp', 'highShockX_min', 'highShockX_max', 'highShockX_avg', 'highShockX_rms',
          'highShockY_min', 'highShockY_max', 'highShockY_avg', 'highShockY_rms',
          'highShockZ_min', 'highShockZ_max', 'highShockZ_avg', 'highShockZ_rms'];
        rows = downloadedData.map(r => [
          r.timestamp,
          r.shockMinX.toFixed(3), r.shockMaxX.toFixed(3), r.shockAvgX.toFixed(3), r.shockRmsX.toFixed(3),
          r.shockMinY.toFixed(3), r.shockMaxY.toFixed(3), r.shockAvgY.toFixed(3), r.shockRmsY.toFixed(3),
          r.shockMinZ.toFixed(3), r.shockMaxZ.toFixed(3), r.shockAvgZ.toFixed(3), r.shockRmsZ.toFixed(3),
        ]);
        break;
      case 'lowShock':
        // Match original software format: lowShockX_min, lowShockX_max, etc.
        headers = ['Timestamp', 'lowShockX_min', 'lowShockX_max', 'lowShockX_avg', 'lowShockX_rms',
          'lowShockY_min', 'lowShockY_max', 'lowShockY_avg', 'lowShockY_rms',
          'lowShockZ_min', 'lowShockZ_max', 'lowShockZ_avg', 'lowShockZ_rms'];
        rows = downloadedData.map(r => [
          r.timestamp,
          r.shockLowMinX.toFixed(4), r.shockLowMaxX.toFixed(4), r.shockLowAvgX.toFixed(4), r.shockLowRmsX.toFixed(4),
          r.shockLowMinY.toFixed(4), r.shockLowMaxY.toFixed(4), r.shockLowAvgY.toFixed(4), r.shockLowRmsY.toFixed(4),
          r.shockLowMinZ.toFixed(4), r.shockLowMaxZ.toFixed(4), r.shockLowAvgZ.toFixed(4), r.shockLowRmsZ.toFixed(4),
        ]);
        break;
      case 'rotational':
        // Match original software format: rpmX_min, rpmX_max, etc.
        headers = ['Timestamp', 'rpmX_min', 'rpmX_max', 'rpmX_avg', 'rpmX_rms',
          'rpmY_min', 'rpmY_max', 'rpmY_avg', 'rpmY_rms',
          'rpmZ_min', 'rpmZ_max', 'rpmZ_avg', 'rpmZ_rms'];
        rows = downloadedData.map(r => [
          r.timestamp,
          r.rpmMinX.toFixed(2), r.rpmMaxX.toFixed(2), r.rpmAvgX.toFixed(2), r.rpmRmsX.toFixed(2),
          r.rpmMinY.toFixed(2), r.rpmMaxY.toFixed(2), r.rpmAvgY.toFixed(2), r.rpmRmsY.toFixed(2),
          r.rpmMinZ.toFixed(2), r.rpmMaxZ.toFixed(2), r.rpmAvgZ.toFixed(2), r.rpmRmsZ.toFixed(2),
        ]);
        break;
      case 'pressure':
        // Match original software format: psi_min, psi_max, psi_avg
        headers = ['Timestamp', 'psi_min', 'psi_max', 'psi_avg'];
        rows = downloadedData.map(r => {
          const p = r.pressure;
          const hasVal = p !== undefined && !isNaN(p);
          return [r.timestamp, hasVal ? p.toFixed(2) : '', hasVal ? p.toFixed(2) : '', hasVal ? p.toFixed(2) : ''];
        });
        break;
      default:
        return;
    }

    const csv = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `procyon_${group}_data.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Compute stats
  const computeStats = (values: number[]) => {
    if (values.length === 0) return { min: '--', max: '--', avg: '--' };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      min: min.toFixed(2),
      max: max.toFixed(2),
      avg: avg.toFixed(2),
    };
  };

  const tempStats = computeStats(downloadedData.map(r => r.temperature).filter(v => !isNaN(v)));
  const battStats = computeStats(downloadedData.map(r => r.batteryVoltage).filter(v => !isNaN(v)));

  const groupLabels: Record<SensorGroup, string> = {
    temperature: wh.temperature || '温度',
    battery: wh.battery || '电池',
    pressure: wh.pressure || '压力',
    highShock: wh.highShock || '高冲击',
    lowShock: wh.lowShock || '低冲击',
    rotational: wh.rotational || '旋转',
  };

  const groupIcons: Record<SensorGroup, string> = {
    temperature: '🌡️',
    battery: '🔋',
    pressure: '📊',
    highShock: '⚡',
    lowShock: '📉',
    rotational: '🔄',
  };

  // No data state
  if (downloadedData.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">{wh.title || '工作历史'}</h2>
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="text-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-slate-300 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">{wh.noHistory || '暂无历史数据'}</h3>
            <p className="text-xs text-slate-500">{wh.noHistoryDescription || '请先从"数据下载"页面下载设备数据'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show last N records in table
  const displayData = downloadedData.slice(0, 500);
  const totalBytes = downloadResult?.partitions?.reduce((sum, p) => sum + (p.size || 0), 0) || 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">{wh.title || '工作历史'}</h2>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          >
            {wh.exportAll || '导出全部CSV'}
          </button>
          <button
            onClick={clearData}
            className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            {wh.clearData || '清除数据'}
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      {downloadResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex gap-6 text-xs">
          <span className="text-blue-700">{wh.totalRecords || '总记录数'}: <strong>{downloadedData.length}</strong></span>
          <span className="text-blue-700">{wh.partitions || '分区'}: <strong>{downloadResult.totalPartitions || '--'}</strong></span>
          <span className="text-blue-700">{wh.totalBytes || '总字节'}: <strong>{totalBytes}</strong></span>
        </div>
      )}

      {/* Sensor Group Cards */}
      <div className="flex-1 overflow-auto space-y-3">
        {/* Temperature */}
        {visibleGroups.temperature && (
          <div className="bg-white border border-slate-200 rounded-lg">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleExpand('temperature')}
            >
              <div className="flex items-center gap-2">
                <span>{groupIcons.temperature}</span>
                <span className="text-sm font-semibold text-slate-700">{groupLabels.temperature}</span>
                <span className="text-xs text-gray-400 ml-2">
                  Min: {tempStats.min}°C | Max: {tempStats.max}°C | Avg: {tempStats.avg}°C
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); handleExportGroup('temperature'); }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  CSV
                </button>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedGroups.temperature ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            {expandedGroups.temperature && (
              <div className="border-t border-slate-100 max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600">{wh.timestamp || '时间'}</th>
                      <th className="px-4 py-2 text-right text-gray-600">{wh.temperature || '温度'} (°C)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayData.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-1.5 font-mono text-gray-700">{r.timestamp}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-gray-700">{r.temperature.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Battery */}
        {visibleGroups.battery && (
          <div className="bg-white border border-slate-200 rounded-lg">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleExpand('battery')}
            >
              <div className="flex items-center gap-2">
                <span>{groupIcons.battery}</span>
                <span className="text-sm font-semibold text-slate-700">{groupLabels.battery}</span>
                <span className="text-xs text-gray-400 ml-2">
                  Min: {battStats.min}mV | Max: {battStats.max}mV | Avg: {battStats.avg}mV
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); handleExportGroup('battery'); }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  CSV
                </button>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedGroups.battery ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            {expandedGroups.battery && (
              <div className="border-t border-slate-100 max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600">{wh.timestamp || '时间'}</th>
                      <th className="px-4 py-2 text-right text-gray-600">{wh.battery || '电池'} (mV)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayData.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-1.5 font-mono text-gray-700">{r.timestamp}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-gray-700">{r.batteryVoltage.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* High Shock */}
        {visibleGroups.highShock && (
          <div className="bg-white border border-slate-200 rounded-lg">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleExpand('highShock')}
            >
              <div className="flex items-center gap-2">
                <span>{groupIcons.highShock}</span>
                <span className="text-sm font-semibold text-slate-700">{groupLabels.highShock} (g)</span>
                <span className="text-xs text-gray-400 ml-2">X/Y/Z min/max/avg/rms</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); handleExportGroup('highShock'); }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  CSV
                </button>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedGroups.highShock ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            {expandedGroups.highShock && (
              <div className="border-t border-slate-100 max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-600">{wh.timestamp || '时间'}</th>
                      <th className="px-2 py-2 text-center text-gray-600" colSpan={4}>X</th>
                      <th className="px-2 py-2 text-center text-gray-600" colSpan={4}>Y</th>
                      <th className="px-2 py-2 text-center text-gray-600" colSpan={4}>Z</th>
                    </tr>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-1"></th>
                      <th className="px-2 py-1 text-center text-gray-500">Min</th>
                      <th className="px-2 py-1 text-center text-gray-500">Max</th>
                      <th className="px-2 py-1 text-center text-gray-500">Avg</th>
                      <th className="px-2 py-1 text-center text-gray-500">Rms</th>
                      <th className="px-2 py-1 text-center text-gray-500">Min</th>
                      <th className="px-2 py-1 text-center text-gray-500">Max</th>
                      <th className="px-2 py-1 text-center text-gray-500">Avg</th>
                      <th className="px-2 py-1 text-center text-gray-500">Rms</th>
                      <th className="px-2 py-1 text-center text-gray-500">Min</th>
                      <th className="px-2 py-1 text-center text-gray-500">Max</th>
                      <th className="px-2 py-1 text-center text-gray-500">Avg</th>
                      <th className="px-2 py-1 text-center text-gray-500">Rms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayData.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1 font-mono text-gray-700">{r.timestamp}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockMinX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockMaxX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockAvgX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockRmsX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockMinY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockMaxY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockAvgY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockRmsY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockMinZ?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockMaxZ?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockAvgZ?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockRmsZ?.toFixed(2) ?? '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Low Shock */}
        {visibleGroups.lowShock && (
          <div className="bg-white border border-slate-200 rounded-lg">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleExpand('lowShock')}
            >
              <div className="flex items-center gap-2">
                <span>{groupIcons.lowShock}</span>
                <span className="text-sm font-semibold text-slate-700">{groupLabels.lowShock} (g)</span>
                <span className="text-xs text-gray-400 ml-2">X/Y/Z min/max/avg/rms</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); handleExportGroup('lowShock'); }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  CSV
                </button>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedGroups.lowShock ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            {expandedGroups.lowShock && (
              <div className="border-t border-slate-100 max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-600">{wh.timestamp || '时间'}</th>
                      <th className="px-2 py-2 text-center text-gray-600" colSpan={4}>X</th>
                      <th className="px-2 py-2 text-center text-gray-600" colSpan={4}>Y</th>
                      <th className="px-2 py-2 text-center text-gray-600" colSpan={4}>Z</th>
                    </tr>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-1"></th>
                      <th className="px-2 py-1 text-center text-gray-500">Min</th>
                      <th className="px-2 py-1 text-center text-gray-500">Max</th>
                      <th className="px-2 py-1 text-center text-gray-500">Avg</th>
                      <th className="px-2 py-1 text-center text-gray-500">Rms</th>
                      <th className="px-2 py-1 text-center text-gray-500">Min</th>
                      <th className="px-2 py-1 text-center text-gray-500">Max</th>
                      <th className="px-2 py-1 text-center text-gray-500">Avg</th>
                      <th className="px-2 py-1 text-center text-gray-500">Rms</th>
                      <th className="px-2 py-1 text-center text-gray-500">Min</th>
                      <th className="px-2 py-1 text-center text-gray-500">Max</th>
                      <th className="px-2 py-1 text-center text-gray-500">Avg</th>
                      <th className="px-2 py-1 text-center text-gray-500">Rms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayData.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1 font-mono text-gray-700">{r.timestamp}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowMinX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowMaxX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowAvgX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowRmsX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowMinY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowMaxY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowAvgY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowRmsY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowMinZ?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowMaxZ?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowAvgZ?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.shockLowRmsZ?.toFixed(2) ?? '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Rotational */}
        {visibleGroups.rotational && (
          <div className="bg-white border border-slate-200 rounded-lg">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleExpand('rotational')}
            >
              <div className="flex items-center gap-2">
                <span>{groupIcons.rotational}</span>
                <span className="text-sm font-semibold text-slate-700">{groupLabels.rotational} (rpm)</span>
                <span className="text-xs text-gray-400 ml-2">X/Y/Z min/max/avg/rms</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); handleExportGroup('rotational'); }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  CSV
                </button>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedGroups.rotational ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            {expandedGroups.rotational && (
              <div className="border-t border-slate-100 max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-600">{wh.timestamp || '时间'}</th>
                      <th className="px-2 py-2 text-center text-gray-600" colSpan={4}>X</th>
                      <th className="px-2 py-2 text-center text-gray-600" colSpan={4}>Y</th>
                      <th className="px-2 py-2 text-center text-gray-600" colSpan={4}>Z</th>
                    </tr>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-1"></th>
                      <th className="px-2 py-1 text-center text-gray-500">Min</th>
                      <th className="px-2 py-1 text-center text-gray-500">Max</th>
                      <th className="px-2 py-1 text-center text-gray-500">Avg</th>
                      <th className="px-2 py-1 text-center text-gray-500">Rms</th>
                      <th className="px-2 py-1 text-center text-gray-500">Min</th>
                      <th className="px-2 py-1 text-center text-gray-500">Max</th>
                      <th className="px-2 py-1 text-center text-gray-500">Avg</th>
                      <th className="px-2 py-1 text-center text-gray-500">Rms</th>
                      <th className="px-2 py-1 text-center text-gray-500">Min</th>
                      <th className="px-2 py-1 text-center text-gray-500">Max</th>
                      <th className="px-2 py-1 text-center text-gray-500">Avg</th>
                      <th className="px-2 py-1 text-center text-gray-500">Rms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayData.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1 font-mono text-gray-700">{r.timestamp}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmMinX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmMaxX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmAvgX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmRmsX?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmMinY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmMaxY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmAvgY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmRmsY?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmMinZ?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmMaxZ?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmAvgZ?.toFixed(2) ?? '--'}</td>
                        <td className="px-2 py-1 text-right font-mono text-gray-700">{r.rpmRmsZ?.toFixed(2) ?? '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Pressure */}
        {visibleGroups.pressure && (
          <div className="bg-white border border-slate-200 rounded-lg">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleExpand('pressure')}
            >
              <div className="flex items-center gap-2">
                <span>{groupIcons.pressure}</span>
                <span className="text-sm font-semibold text-slate-700">{groupLabels.pressure} (psi)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); handleExportGroup('pressure'); }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  CSV
                </button>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedGroups.pressure ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            {expandedGroups.pressure && (
              <div className="border-t border-slate-100 max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600">{wh.timestamp || '时间'}</th>
                      <th className="px-4 py-2 text-right text-gray-600">{wh.pressure || '压力'} (psi)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayData.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-1.5 font-mono text-gray-700">{r.timestamp}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-gray-700">{r.pressure !== undefined && !isNaN(r.pressure) ? r.pressure.toFixed(2) : '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Visibility Toggles */}
      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
        {(Object.keys(visibleGroups) as SensorGroup[]).map(group => (
          <label key={group} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={visibleGroups[group]}
              onChange={() => toggleVisible(group)}
              className="rounded border-gray-300"
            />
            {groupLabels[group]}
          </label>
        ))}
      </div>
    </div>
  );
}
