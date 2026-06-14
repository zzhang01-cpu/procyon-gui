'use client';

import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Cable,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { ProcyonSerial } from '@/lib/usb/procyon';

export default function ConnectionPage() {
  const { t, language } = useI18n();
  const { connected, connecting, deviceInfo, connect, disconnect } = useDevice();
  const [baudRate, setBaudRate] = useState('115200');
  const [serialSupported] = useState(ProcyonSerial.isSupported());

  return (
    <div className="space-y-6">
      {/* Serial Support Check */}
      {!serialSupported && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t.errors.browserNotSupported}. Please use Chrome or Edge browser.
          </AlertDescription>
        </Alert>
      )}

      {/* Connection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cable className="w-5 h-5" />
            {t.connection.title}
          </CardTitle>
          <CardDescription>{t.connection.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Serial Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{language === 'zh' ? '波特率' : 'Baud Rate'}</Label>
              <Input
                value={baudRate}
                onChange={(e) => setBaudRate(e.target.value)}
                placeholder="115200"
                disabled={connected}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'zh' ? '通信方式' : 'Protocol'}</Label>
              <Input
                value="USB CDC (Serial)"
                disabled
                className="bg-slate-50"
              />
            </div>
          </div>

          {/* Connection Status */}
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {connected ? (
                  <>
                    <Wifi className="w-6 h-6 text-green-500" />
                    <div>
                      <p className="font-medium text-green-700">{t.connection.connected}</p>
                      <p className="text-sm text-slate-500">
                        {language === 'zh' ? `波特率: ${baudRate}` : `Baud Rate: ${baudRate}`}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-6 h-6 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-600">{t.connection.disconnected}</p>
                      <p className="text-sm text-slate-500">
                        {t.connection.noDevice}
                      </p>
                    </div>
                  </>
                )}
              </div>
              <Button
                onClick={connected ? disconnect : () => {
                  const rate = parseInt(baudRate, 10);
                  connect(isNaN(rate) ? undefined : rate);
                }}
                disabled={connecting || !serialSupported}
                variant={connected ? 'destructive' : 'default'}
                size="lg"
              >
                {connecting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    {t.connection.connecting}
                  </>
                ) : connected ? (
                  t.connection.disconnect
                ) : (
                  t.connection.connect
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Device Info Card */}
      {connected && deviceInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              {t.connection.deviceInfo}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-slate-500">{language === 'zh' ? '设备类型' : 'Device Type'}</Label>
                <p className="font-medium">{deviceInfo.deviceType || 'Procyon CM'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-500">{t.connection.serialNumber}</Label>
                <p className="font-medium">{deviceInfo.serialNumber || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-500">{t.connection.firmwareVersion}</Label>
                <p className="font-medium">{deviceInfo.firmwareVersion || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-500">{t.connection.batteryVoltage}</Label>
                <p className="font-medium">{deviceInfo.batteryVoltage.toFixed(3)} V</p>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-500">{t.connection.temperature}</Label>
                <p className="font-medium">{deviceInfo.temperature.toFixed(2)} °C</p>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-500">{language === 'zh' ? '设备类型' : 'Device Type'}</Label>
                <p className="font-medium">{deviceInfo.deviceType || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>{t.common.info}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
            <li>{language === 'zh' ? '确保 Procyon CM 设备已通过 USB 线缆连接到电脑' : 'Ensure Procyon CM device is connected via USB cable'}</li>
            <li>{language === 'zh' ? '确认设备在设备管理器的"端口 (COM 和 LPT)"下显示为 COM 口' : 'Confirm the device appears as a COM port under "Ports (COM & LPT)" in Device Manager'}</li>
            <li>{language === 'zh' ? '点击"连接"按钮，在弹出的串口选择器中选择 Procyon 设备' : 'Click "Connect" and select the Procyon serial port from the popup'}</li>
            <li>{language === 'zh' ? '连接成功后，可以查看设备信息、设置参数或下载数据' : 'After connection, you can view device info, set parameters, or download data'}</li>
            <li>{language === 'zh' ? '如需断开设备，点击"断开"按钮' : 'Click "Disconnect" to disconnect the device'}</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
