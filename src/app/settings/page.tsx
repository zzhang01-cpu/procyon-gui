'use client';

import React, { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  Save,
  RotateCcw,
  Monitor,
  Database,
  Usb,
  CheckCircle2,
} from 'lucide-react';

export default function SettingsPage() {
  const { t, language } = useI18n();
  
  // Settings state
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [dataFormat, setDataFormat] = useState<'csv' | 'json' | 'excel'>('csv');
  const [autoSave, setAutoSave] = useState(false);
  const [saveInterval, setSaveInterval] = useState('60');
  const [vendorId, setVendorId] = useState('0x0483');
  const [productId, setProductId] = useState('0x5740');
  const [timeoutValue, setTimeoutValue] = useState('5000');
  const [retryCount, setRetryCount] = useState('3');
  const [logLevel, setLogLevel] = useState<'debug' | 'info' | 'warning' | 'error'>('info');
  
  const [saved, setSaved] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('procyon_settings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        setTheme(settings.theme || 'light');
        setFontSize(settings.fontSize || 'medium');
        setDataFormat(settings.dataFormat || 'csv');
        setAutoSave(settings.autoSave || false);
        setSaveInterval(settings.saveInterval || '60');
        setVendorId(settings.vendorId || '0x0483');
        setProductId(settings.productId || '0x5740');
        setTimeoutValue(settings.timeout || '5000');
        setRetryCount(settings.retryCount || '3');
        setLogLevel(settings.logLevel || 'info');
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  }, []);

  const handleSave = () => {
    const settings = {
      theme,
      fontSize,
      dataFormat,
      autoSave,
      saveInterval,
      vendorId,
      productId,
      timeoutValue,
      retryCount,
      logLevel,
    };
    
    localStorage.setItem('procyon_settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setTheme('light');
    setFontSize('medium');
    setDataFormat('csv');
    setAutoSave(false);
    setSaveInterval('60');
    setVendorId('0x0483');
    setProductId('0x5740');
    setRetryCount('3');
    setLogLevel('info');
  };

  return (
    <div className="space-y-6">
      {/* Save Success Alert */}
      {saved && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="text-green-700">{t.common.success}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            {t.settings.title}
          </CardTitle>
          <CardDescription>{t.settings.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="general" className="space-y-4">
            <TabsList>
              <TabsTrigger value="general">
                <Monitor className="w-4 h-4 mr-2" />
                {t.settings.general}
              </TabsTrigger>
              <TabsTrigger value="data">
                <Database className="w-4 h-4 mr-2" />
                {t.settings.data}
              </TabsTrigger>
              <TabsTrigger value="usb">
                <Usb className="w-4 h-4 mr-2" />
                USB
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.settings.theme}</Label>
                  <Select value={theme} onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">{t.settings.light}</SelectItem>
                      <SelectItem value="dark">{t.settings.dark}</SelectItem>
                      <SelectItem value="system">{t.settings.system}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>{t.settings.fontSize}</Label>
                  <Select value={fontSize} onValueChange={(v) => setFontSize(v as 'small' | 'medium' | 'large')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">{t.settings.small}</SelectItem>
                      <SelectItem value="medium">{t.settings.medium}</SelectItem>
                      <SelectItem value="large">{t.settings.large}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t.settings.logLevel}</Label>
                  <Select value={logLevel} onValueChange={(v) => setLogLevel(v as 'debug' | 'info' | 'warning' | 'error')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debug">{t.settings.debug}</SelectItem>
                      <SelectItem value="info">{t.settings.info}</SelectItem>
                      <SelectItem value="warning">{t.settings.warning}</SelectItem>
                      <SelectItem value="error">{t.settings.error}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="data" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.settings.dataFormat}</Label>
                  <Select value={dataFormat} onValueChange={(v) => setDataFormat(v as 'csv' | 'json' | 'excel')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">{t.settings.csv}</SelectItem>
                      <SelectItem value="json">{t.settings.json}</SelectItem>
                      <SelectItem value="excel">{t.settings.excel}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t.settings.saveInterval} (s)</Label>
                  <Input
                    type="number"
                    value={saveInterval}
                    onChange={(e) => setSaveInterval(e.target.value)}
                    placeholder="60"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoSave"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="autoSave">{t.settings.autoSave}</Label>
              </div>
            </TabsContent>

            <TabsContent value="usb" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.settings.vendorId}</Label>
                  <Input
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    placeholder="0x0483"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t.settings.productId}</Label>
                  <Input
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    placeholder="0x5740"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t.settings.timeout} (ms)</Label>
                  <Input
                    type="number"
                    value={timeoutValue}
                    onChange={(e) => setTimeoutValue(e.target.value)}
                    placeholder="5000"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t.settings.retryCount}</Label>
                  <Input
                    type="number"
                    value={retryCount}
                    onChange={(e) => setRetryCount(e.target.value)}
                    placeholder="3"
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  {language === 'zh'
                    ? '提示：USB 配置修改后需要重新连接设备才能生效。'
                    : 'Note: USB configuration changes require device reconnection to take effect.'}
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6 pt-6 border-t">
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              {t.settings.saveSettings}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {t.settings.resetSettings}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
