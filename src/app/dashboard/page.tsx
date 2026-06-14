'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Usb,
  Thermometer,
  Battery,
  Cpu,
  HardDrive,
  Activity,
  Wifi,
  WifiOff,
} from 'lucide-react';

export default function DashboardPage() {
  const { t } = useI18n();
  const { connected, connecting, deviceInfo, connect, disconnect } = useDevice();

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {connected ? (
              <Wifi className="w-5 h-5 text-green-500" />
            ) : (
              <WifiOff className="w-5 h-5 text-slate-400" />
            )}
            {t.connection.connectionStatus}
          </CardTitle>
          <Button
            onClick={connected ? disconnect : () => connect()}
            disabled={connecting}
            variant={connected ? 'destructive' : 'default'}
          >
            {connecting
              ? t.connection.connecting
              : connected
              ? t.connection.disconnect
              : t.connection.connect}
          </Button>
        </CardHeader>
        <CardContent>
          {connected && deviceInfo ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Cpu className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t.connection.deviceInfo}</p>
                  <p className="font-medium">{deviceInfo.deviceType || 'Procyon CM'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Battery className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t.connection.batteryVoltage}</p>
                  <p className="font-medium">{deviceInfo.batteryVoltage.toFixed(2)} V</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Thermometer className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t.connection.temperature}</p>
                  <p className="font-medium">{deviceInfo.temperature.toFixed(1)} °C</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <HardDrive className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t.connection.firmwareVersion}</p>
                  <p className="font-medium">{deviceInfo.firmwareVersion || 'N/A'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Usb className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">{t.connection.noDevice}</p>
              <p className="text-sm text-slate-400 mt-2">{t.connection.connectFirst}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      {connected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {t.connection.serialNumber}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{deviceInfo?.serialNumber || 'N/A'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {t.status.ready}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <p className="text-2xl font-bold text-green-600">{t.status.online}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                USB {t.connection.status}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {deviceInfo ? `0x${deviceInfo.vendorId.toString(16).toUpperCase()}:0x${deviceInfo.productId.toString(16).toUpperCase()}` : 'N/A'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>{t.about.features}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <span>{t.about.feature1}</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span>{t.about.feature2}</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full" />
              <span>{t.about.feature3}</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full" />
              <span>{t.about.feature4}</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-2 h-2 bg-pink-500 rounded-full" />
              <span>{t.about.feature5}</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
