'use client';

import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  TestTube,
  Play,
  StopCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SkipForward,
  AlertCircle,
  FileDown,
} from 'lucide-react';

export default function SystemTestPage() {
  const { t, language } = useI18n();
  const { connected, testResults, runSelfTest } = useDevice();
  
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const handleStartTest = async () => {
    if (!connected) {
      setError(t.errors.deviceNotFound);
      return;
    }

    setTesting(true);
    setProgress(0);
    setError(null);
    setCompleted(false);

    try {
      // Simulate progress
      const interval = setInterval(() => {
        setProgress((p) => Math.min(p + 10, 90));
      }, 500);

      await runSelfTest();
      
      clearInterval(interval);
      setProgress(100);
      setCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.testFailed);
    } finally {
      setTesting(false);
    }
  };

  const handleStopTest = () => {
    setTesting(false);
  };

  const handleExportReport = () => {
    if (testResults.length === 0) return;

    const report = {
      timestamp: new Date().toISOString(),
      device: 'Procyon CM',
      results: testResults,
      summary: {
        total: testResults.length,
        passed: testResults.filter(r => r.status === 'pass').length,
        failed: testResults.filter(r => r.status === 'fail').length,
        warnings: testResults.filter(r => r.status === 'warning').length,
      },
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `procyon_test_report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'skip':
        return <SkipForward className="w-5 h-5 text-slate-400" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pass':
        return t.systemTest.pass;
      case 'fail':
        return t.systemTest.fail;
      case 'warning':
        return t.systemTest.warning;
      case 'skip':
        return t.systemTest.skip;
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Alert */}
      {completed && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">
            {t.systemTest.testComplete}
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

      {/* Test Control Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="w-5 h-5" />
            {t.systemTest.title}
          </CardTitle>
          <CardDescription>{t.systemTest.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress */}
          {(testing || completed) && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t.systemTest.testProgress}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            {!testing ? (
              <Button onClick={handleStartTest} disabled={!connected}>
                <Play className="w-4 h-4 mr-2" />
                {t.systemTest.startTest}
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleStopTest}>
                <StopCircle className="w-4 h-4 mr-2" />
                {t.systemTest.stopTest}
              </Button>
            )}
            
            {testResults.length > 0 && (
              <Button variant="outline" onClick={handleExportReport}>
                <FileDown className="w-4 h-4 mr-2" />
                {t.systemTest.exportReport}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Test Results Card */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.systemTest.testResult}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {testResults.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(result.status)}
                    <div>
                      <p className="font-medium">{result.name}</p>
                      {result.message && (
                        <p className="text-sm text-slate-500">{result.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${
                      result.status === 'pass' ? 'text-green-600' :
                      result.status === 'fail' ? 'text-red-600' :
                      result.status === 'warning' ? 'text-yellow-600' :
                      'text-slate-500'
                    }`}>
                      {getStatusText(result.status)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(result.duration / 1000).toFixed(1)}s
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-6 pt-6 border-t">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{testResults.length}</p>
                  <p className="text-sm text-slate-500">{t.systemTest.allTests}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {testResults.filter(r => r.status === 'pass').length}
                  </p>
                  <p className="text-sm text-slate-500">{t.systemTest.pass}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {testResults.filter(r => r.status === 'fail').length}
                  </p>
                  <p className="text-sm text-slate-500">{t.systemTest.fail}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {testResults.filter(r => r.status === 'warning').length}
                  </p>
                  <p className="text-sm text-slate-500">{t.systemTest.warning}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
