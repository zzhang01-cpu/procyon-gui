'use client';

import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Download as DownloadIcon,
  StopCircle,
  FileDown,
  AlertCircle,
  CheckCircle2,
  Database,
  Clock,
  Hash,
} from 'lucide-react';
import { exportToCSV } from '@/lib/usb/procyon';

export default function DownloadPage() {
  const { t, language } = useI18n();
  const { connected, downloadedData, downloadData, clearData } = useDevice();
  
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const handleDownload = async () => {
    if (!connected) {
      setError(t.errors.deviceNotFound);
      return;
    }

    setDownloading(true);
    setProgress(0);
    setError(null);
    setCompleted(false);

    try {
      await downloadData((p) => setProgress(p));
      setCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.downloadFailed);
    } finally {
      setDownloading(false);
    }
  };

  const handleStop = () => {
    setDownloading(false);
  };

  const handleExportCSV = () => {
    if (downloadedData.length === 0) return;

    const csv = exportToCSV(downloadedData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `procyon_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    clearData();
    setCompleted(false);
    setProgress(0);
  };

  return (
    <div className="space-y-6">
      {/* Status Alert */}
      {completed && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">
            {t.download.downloadComplete} - {downloadedData.length} records
          </AlertDescription>
        </Alert>
      )}
      
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!connected && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t.connection.connectFirst}</AlertDescription>
        </Alert>
      )}

      {/* Download Control Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DownloadIcon className="w-5 h-5" />
            {t.download.title}
          </CardTitle>
          <CardDescription>{t.download.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress */}
          {(downloading || completed) && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t.download.downloadProgress}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            {!downloading ? (
              <Button onClick={handleDownload} disabled={!connected}>
                <DownloadIcon className="w-4 h-4 mr-2" />
                {t.download.startDownload}
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleStop}>
                <StopCircle className="w-4 h-4 mr-2" />
                {t.download.stopDownload}
              </Button>
            )}
            
            {downloadedData.length > 0 && (
              <>
                <Button variant="outline" onClick={handleExportCSV}>
                  <FileDown className="w-4 h-4 mr-2" />
                  {t.download.exportCSV}
                </Button>
                <Button variant="outline" onClick={handleClear}>
                  {t.download.clearData}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Summary Card */}
      {downloadedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              {t.download.statistics}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <Hash className="w-4 h-4" />
                  {t.download.recordCount}
                </div>
                <p className="text-2xl font-bold mt-1">{downloadedData.length}</p>
              </div>
              
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <Clock className="w-4 h-4" />
                  {t.download.timeRange}
                </div>
                <p className="text-2xl font-bold mt-1">
                  {downloadedData.length > 1 
                    ? `${Math.round((new Date(downloadedData[downloadedData.length - 1].timestamp).getTime() - new Date(downloadedData[0].timestamp).getTime()) / 1000)}s`
                    : '0s'}
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  {t.download.temperature}
                </div>
                <p className="text-2xl font-bold mt-1">
                  {downloadedData.length > 0
                    ? `${(downloadedData.reduce((sum, d) => sum + d.temperature, 0) / downloadedData.length).toFixed(1)}°C`
                    : 'N/A'}
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  {t.connection.batteryVoltage}
                </div>
                <p className="text-2xl font-bold mt-1">
                  {downloadedData.length > 0
                    ? `${(downloadedData.reduce((sum, d) => sum + d.batteryVoltage, 0) / downloadedData.length).toFixed(2)}V`
                    : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Preview Card */}
      {downloadedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.download.viewData}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">{t.download.timestamp}</th>
                    <th className="text-left py-2 px-3">{t.download.temperature} (°C)</th>
                    <th className="text-left py-2 px-3">{t.connection.batteryVoltage} (V)</th>
                    <th className="text-left py-2 px-3">{t.download.rpm} X (avg)</th>
                    <th className="text-left py-2 px-3">{t.download.shock} X (g)</th>
                  </tr>
                </thead>
                <tbody>
                  {downloadedData.slice(0, 10).map((data, index) => (
                    <tr key={index} className="border-b hover:bg-slate-50">
                      <td className="py-2 px-3">{data.timestamp}</td>
                      <td className="py-2 px-3">{data.temperature.toFixed(2)}</td>
                      <td className="py-2 px-3">{data.batteryVoltage.toFixed(3)}</td>
                      <td className="py-2 px-3">{data.rpmAvgX.toFixed(2)}</td>
                      <td className="py-2 px-3">{data.shockLowAvgX.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {downloadedData.length > 10 && (
                <p className="text-sm text-slate-500 mt-2 text-center">
                  {language === 'zh' 
                    ? `显示前 10 条记录，共 ${downloadedData.length} 条` 
                    : `Showing first 10 records of ${downloadedData.length} total`}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
