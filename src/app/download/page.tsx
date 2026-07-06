'use client';

import { useState, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';

export default function DownloadPage() {
  const { t } = useI18n();
  const { connected, downloadData, downloadProgress, downloadResult, clearData } = useDevice();
  const dl = t.download;
  const [activeTab, setActiveTab] = useState<'download' | 'upload'>('download');
  const [parseData, setParseData] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [savedFiles, setSavedFiles] = useState<string[]>([]);
  const [saveDir, setSaveDir] = useState('');

  const handleDownload = useCallback(async () => {
    if (!connected) return;
    setDownloading(true);
    setSavedFiles([]);
    try {
      const result = await downloadData();
      // Extract saved file paths from auto-save
      const files = (result as any).csvFilePaths as string[] || [];
      const dir = (result as any).csvSaveDir as string || '';
      if (files.length > 0) {
        setSavedFiles(files);
        setSaveDir(dir);
      }
    } finally {
      setDownloading(false);
    }
  }, [connected, downloadData]);

  const handleClear = useCallback(() => {
    clearData();
    setSavedFiles([]);
    setSaveDir('');
  }, [clearData]);

  // Extract filename from full path
  const getFileName = (path: string): string => {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || path;
  };

  // Get file type label from saved file entry
  const getFileTypeLabel = (entry: string): string => {
    if (entry.includes('.pcmbin:')) return '.pcmbin (Raw Binary)';
    if (entry.includes('main.csv:')) return 'main.csv (Record Index)';
    if (entry.includes('OneSecondData')) return 'OneSecondData CSV';
    if (entry.includes('PhoenixOneSecondData')) return 'PhoenixOneSecondData CSV';
    if (entry.includes('RpmAxialWaveform')) return 'RpmAxialWaveform CSV';
    if (entry.includes('FilteredRpmWaveform')) return 'FilteredRpmWaveform CSV';
    if (entry.includes('AccelWaveform')) return 'AccelWaveform CSV';
    if (entry.includes('LowShockWaveform')) return 'LowShockWaveform CSV';
    if (entry.includes('.csv:')) return 'CSV';
    return 'File';
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">{dl.title}</h2>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4">
        <button
          onClick={() => setActiveTab('download')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'download'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {dl.fileDownload}
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'upload'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {dl.fileUpload}
        </button>
      </div>

      {activeTab === 'download' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          {!connected ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500">{t.common.noDeviceConnected}</p>
            </div>
          ) : (
            <div>
              {/* Parse Data Checkbox */}
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="parseData"
                  checked={parseData}
                  onChange={(e) => setParseData(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <label htmlFor="parseData" className="text-sm text-slate-600">{dl.parseData}</label>
              </div>

              {/* Download Progress */}
              {downloading && downloadProgress && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-blue-700">{dl.dumping}</span>
                    <span className="text-sm text-blue-700">{downloadProgress.percent}%</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${downloadProgress.percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-blue-600 mt-1">
                    {dl.partitions}: {downloadProgress.partition}/{downloadProgress.totalPartitions} | {dl.recordCount}: {downloadProgress.chunk}/{downloadProgress.totalChunks}
                  </p>
                </div>
              )}

              {/* Download Result */}
              {downloadResult && !downloading && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm text-green-700 font-medium">{dl.downloadComplete}</p>
                  <p className="text-xs text-green-600 mt-1">
                    {dl.partitions}: {downloadResult.totalPartitions}
                  </p>
                  {(downloadResult as any).recordCount > 0 && (
                    <p className="text-xs text-green-600 mt-1">
                      {dl.recordCount}: {(downloadResult as any).recordCount}
                    </p>
                  )}
                </div>
              )}

              {/* Saved Files List */}
              {savedFiles.length > 0 && (
                <div className="mb-4 p-3 bg-white border border-slate-200 rounded">
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    {dl.downloadCompleteLog
                      ? dl.downloadCompleteLog.replace('{0}', String(downloadResult?.totalPartitions || 0))
                      : 'Files saved:'}
                  </p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {savedFiles.map((entry, idx) => {
                      const filePath = entry.includes(': ') ? entry.split(': ').slice(1).join(': ') : entry;
                      const fileName = getFileName(filePath);
                      const fileType = getFileTypeLabel(entry);
                      return (
                        <div key={idx} className="flex items-center gap-2 text-xs text-slate-600 py-0.5">
                          <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                          <span className="font-mono text-slate-700 truncate">{fileName}</span>
                          <span className="text-slate-400 flex-shrink-0">({fileType})</span>
                        </div>
                      );
                    })}
                  </div>
                  {saveDir && (
                    <p className="text-xs text-slate-400 mt-2">
                      {dl.downloadPath}: {saveDir}
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {downloading && (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {downloading ? dl.dumping : dl.startDumping}
                </button>
                {downloadResult && (
                  <button
                    onClick={handleClear}
                    className="px-4 py-2 text-sm border border-slate-300 text-slate-600 rounded hover:bg-slate-50"
                  >
                    {dl.clearData}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="text-center py-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-slate-300 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm text-slate-500">{dl.uploadDescription}</p>
          </div>
        </div>
      )}
    </div>
  );
}
