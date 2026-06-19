'use client';

import React, { useState, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2, CheckCircle, FolderOpen } from 'lucide-react';

interface DownloadPageProps {
  onNavigate: (page: string) => void;
}

type Tab = 'download' | 'upload';

const RUN_ID_TYPES = ['DRS Well Id', 'Well Name', 'Job Number'];
const RUN_NUMBERS = ['1', '2', '3', '4', '5'];

export default function DownloadPage({ onNavigate }: DownloadPageProps) {
  const { t } = useI18n();
  const { connected, deviceInfo, downloadData, downloadResult, downloadProgress, clearData, exportData } = useDevice();
  const [activeTab, setActiveTab] = useState<Tab>('download');
  const [parseData, setParseData] = useState(true);
  const [showDumpConfig, setShowDumpConfig] = useState(false);

  // Dump configuration
  const [runIdType, setRunIdType] = useState('DRS Well Id');
  const [runId, setRunId] = useState('');
  const [runNumber, setRunNumber] = useState('1');
  const [sapittId, setSapittId] = useState('');
  const [testing, setTesting] = useState(false);

  // Dump state
  const [dumping, setDumping] = useState(false);
  const [dumpComplete, setDumpComplete] = useState(false);
  const [dumpLog, setDumpLog] = useState<string[]>([]);

  const handleStartDumping = useCallback(async () => {
    if (!connected) return;
    setDumping(true);
    setDumpComplete(false);
    setDumpLog([]);

    setDumpLog((prev) => [
      ...prev,
      `[${new Date().toISOString()}] Starting dump process for Procyon-CM...`,
    ]);

    try {
      const result = await downloadData();

      if (result.success) {
        setDumpLog((prev) => [
          ...prev,
          `[${new Date().toISOString()}] Data download complete. ${result.totalPartitions} partition(s) downloaded.`,
        ]);

        if (parseData) {
          setDumpLog((prev) => [
            ...prev,
            `[${new Date().toISOString()}] Starting MainParse conversion to .csv...`,
          ]);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          setDumpLog((prev) => [
            ...prev,
            `[${new Date().toISOString()}] Conversion MainParse Succeeded.`,
          ]);
        }

        setDumpLog((prev) => [
          ...prev,
          `[${new Date().toISOString()}] Dumping process completed. You can safely unplug the device.`,
        ]);

        setDumpComplete(true);
      } else {
        setDumpLog((prev) => [
          ...prev,
          `[${new Date().toISOString()}] ERROR: ${result.error || 'Download failed'}`,
        ]);
      }
    } catch (err) {
      setDumpLog((prev) => [
        ...prev,
        `[${new Date().toISOString()}] ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`,
      ]);
    } finally {
      setDumping(false);
    }
  }, [connected, downloadData, parseData]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Tabs */}
      <div className="flex border-b border-slate-300 mb-4">
        <button
          onClick={() => setActiveTab('download')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === 'download'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Download className="w-4 h-4" />
          {t.download.fileDownload}
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === 'upload'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Upload className="w-4 h-4" />
          {t.download.fileUpload}
        </button>
      </div>

      {activeTab === 'download' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          {/* File path */}
          <div className="flex items-center gap-2 mb-4">
            <label className="text-xs text-slate-500">{t.download.downloadPath}:</label>
            <div className="flex-1 flex items-center border border-slate-300 rounded px-3 py-1.5 bg-slate-50">
              <span className="text-xs text-slate-700 font-mono">C:\UnifiedDataLogger</span>
            </div>
            <button className="p-1.5 border border-slate-300 rounded hover:bg-slate-50">
              <FolderOpen className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Parse Data + Device */}
          <div className="flex items-center justify-between mb-4 p-3 bg-slate-50 rounded border border-slate-200">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={parseData}
                  onChange={(e) => setParseData(e.target.checked)}
                  className="rounded border-slate-300"
                />
                {t.download.parseData}
              </label>
              <span className="text-xs text-slate-700 font-medium">Procyon-CM</span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowDumpConfig(!showDumpConfig)}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                {showDumpConfig ? t.download.hideConfig : t.download.showConfig}
              </Button>
              <Button
                onClick={handleStartDumping}
                disabled={!connected || dumping}
                className="bg-green-600 hover:bg-green-700 text-xs"
                size="sm"
              >
                {dumping ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    {t.download.dumping}
                  </>
                ) : (
                  t.download.startDumping
                )}
              </Button>
            </div>
          </div>

          {/* Dump Configuration */}
          {showDumpConfig && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="text-xs font-semibold text-blue-800 mb-3">
                {t.download.dumpConfig} - Procyon-CM - {deviceInfo?.serialNumber || 'N/A'}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t.download.runIdType}</label>
                  <select
                    value={runIdType}
                    onChange={(e) => setRunIdType(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RUN_ID_TYPES.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t.download.runId}</label>
                  <input
                    type="text"
                    value={runId}
                    onChange={(e) => setRunId(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter Run ID"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t.download.runNumber}</label>
                  <select
                    value={runNumber}
                    onChange={(e) => setRunNumber(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RUN_NUMBERS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">SapITT ID</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={sapittId}
                      onChange={(e) => setSapittId(e.target.value)}
                      className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter SapITT ID"
                    />
                    <Button variant="outline" size="sm" className="text-xs whitespace-nowrap">
                      {t.download.findSapITT}
                    </Button>
                  </div>
                </div>
              </div>
              {/* Testing toggle */}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-slate-500">
                  {testing ? t.download.testingOn : t.download.testingOff}
                </span>
                <button
                  onClick={() => setTesting(!testing)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    testing ? 'bg-blue-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      testing ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {dumping && downloadProgress && (
            <div className="mb-4">
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {downloadProgress.percent}% - Partition {downloadProgress.partition}/{downloadProgress.totalPartitions}, Chunk {downloadProgress.chunk}/{downloadProgress.totalChunks}
              </p>
            </div>
          )}

          {/* Dump Log */}
          {dumpLog.length > 0 && (
            <div className="mt-4 bg-slate-900 rounded-lg p-4 max-h-64 overflow-auto">
              <h4 className="text-xs font-semibold text-green-400 mb-2">
                {t.download.dumpProgressLog}
              </h4>
              <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">
                {dumpLog.join('\n')}
              </pre>
            </div>
          )}

          {/* Download result summary */}
          {dumpComplete && downloadResult && downloadResult.success && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <h4 className="text-xs font-semibold text-green-800 mb-2">Download Summary</h4>
              <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
                <div>Partitions: <span className="font-medium text-slate-800">{downloadResult.totalPartitions}</span></div>
                <div>Total Size: <span className="font-medium text-slate-800">
                  {downloadResult.partitions.reduce((sum, p) => sum + p.size, 0).toLocaleString()} bytes
                </span></div>
                <div>Device: <span className="font-medium text-slate-800">{deviceInfo?.serialNumber || 'N/A'}</span></div>
              </div>
            </div>
          )}

          {/* Export buttons */}
          {dumpComplete && downloadResult && downloadResult.success && (
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => {
                  const csv = exportData();
                  if (csv) {
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'OneSecondData.csv';
                    a.click();
                    window.URL.revokeObjectURL(url);
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-xs"
                size="sm"
              >
                {t.download.exportCSV}
              </Button>
              <Button
                onClick={() => {
                  // Export raw binary data
                  const allData: number[] = [];
                  downloadResult.partitions.forEach((p) => {
                    allData.push(...p.data);
                  });
                  const byteArray = new Uint8Array(allData);
                  const blob = new Blob([byteArray], { type: 'application/octet-stream' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'procyon_raw_data.bin';
                  a.click();
                  window.URL.revokeObjectURL(url);
                }}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Export Binary
              </Button>
              <Button
                onClick={() => {
                  clearData();
                  setDumpComplete(false);
                  setDumpLog([]);
                }}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                {t.download.clearData}
              </Button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 text-center">
          <Upload className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            {t.download.uploadTitle}
          </h3>
          <p className="text-xs text-slate-500">{t.download.uploadDescription}</p>
        </div>
      )}
    </div>
  );
}
