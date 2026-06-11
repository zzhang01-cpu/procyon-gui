'use client';

import React, { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Save,
  Download,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Settings2,
} from 'lucide-react';

export default function ParametersPage() {
  const { t, language } = useI18n();
  const { connected, deviceInfo, setToolSN, setRunID, setCustomer, setDistrict, setCountry, setDepthOut } = useDevice();
  
  // Form states
  const [toolSN, setToolSNState] = useState('');
  const [runID, setRunIDState] = useState('');
  const [customer, setCustomerState] = useState('');
  const [district, setDistrictState] = useState('');
  const [country, setCountryState] = useState('');
  const [depthOut, setDepthOutState] = useState('');
  const [housingNumber, setHousingNumber] = useState('');
  const [bhaSerial, setBhaSerial] = useState('');
  const [sensorHeadSerial, setSensorHeadSerial] = useState('');
  const [pressureSensorSerial, setPressureSensorSerial] = useState('');
  const [limpetSerial, setLimpetSerial] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load device info when connected
  useEffect(() => {
    if (connected && deviceInfo) {
      setToolSNState(deviceInfo.serialNumber || '');
    }
  }, [connected, deviceInfo]);

  const handleSave = async () => {
    if (!connected) {
      setError(t.errors.deviceNotFound);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      if (toolSN) await setToolSN(toolSN);
      if (runID) await setRunID(runID);
      if (customer) await setCustomer(customer);
      if (district) await setDistrict(district);
      if (country) await setCountry(country);
      if (depthOut) await setDepthOut(parseFloat(depthOut));
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setToolSNState('');
    setRunIDState('');
    setCustomerState('');
    setDistrictState('');
    setCountryState('');
    setDepthOutState('');
    setHousingNumber('');
    setBhaSerial('');
    setSensorHeadSerial('');
    setPressureSensorSerial('');
    setLimpetSerial('');
  };

  return (
    <div className="space-y-6">
      {/* Status Alert */}
      {saved && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">
            {t.parameters.parameterSaved}
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

      {/* Parameters Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            {t.parameters.title}
          </CardTitle>
          <CardDescription>{t.parameters.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="basic" className="space-y-4">
            <TabsList>
              <TabsTrigger value="basic">{t.parameters.basicInfo}</TabsTrigger>
              <TabsTrigger value="sensor">{t.parameters.sensorConfig}</TabsTrigger>
              <TabsTrigger value="advanced">{t.parameters.advancedConfig}</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.parameters.toolSN}</Label>
                  <Input
                    value={toolSN}
                    onChange={(e) => setToolSNState(e.target.value)}
                    placeholder="e.g., PROCM-001"
                    disabled={!connected}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.parameters.runID}</Label>
                  <Input
                    value={runID}
                    onChange={(e) => setRunIDState(e.target.value)}
                    placeholder="e.g., RUN-2024-001"
                    disabled={!connected}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.parameters.customer}</Label>
                  <Input
                    value={customer}
                    onChange={(e) => setCustomerState(e.target.value)}
                    placeholder={language === 'zh' ? '客户名称' : 'Customer Name'}
                    disabled={!connected}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.parameters.district}</Label>
                  <Input
                    value={district}
                    onChange={(e) => setDistrictState(e.target.value)}
                    placeholder={language === 'zh' ? '区域' : 'District'}
                    disabled={!connected}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.parameters.country}</Label>
                  <Input
                    value={country}
                    onChange={(e) => setCountryState(e.target.value)}
                    placeholder={language === 'zh' ? '国家' : 'Country'}
                    disabled={!connected}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.parameters.depthOut}</Label>
                  <Input
                    type="number"
                    value={depthOut}
                    onChange={(e) => setDepthOutState(e.target.value)}
                    placeholder="0.00"
                    disabled={!connected}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sensor" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.parameters.housingNumber}</Label>
                  <Input
                    value={housingNumber}
                    onChange={(e) => setHousingNumber(e.target.value)}
                    placeholder="e.g., H-001"
                    disabled={!connected}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.parameters.bhaSerial}</Label>
                  <Input
                    value={bhaSerial}
                    onChange={(e) => setBhaSerial(e.target.value)}
                    placeholder="e.g., BHA-001"
                    disabled={!connected}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.parameters.sensorHeadSerial}</Label>
                  <Input
                    value={sensorHeadSerial}
                    onChange={(e) => setSensorHeadSerial(e.target.value)}
                    placeholder="e.g., SH-001"
                    disabled={!connected}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.parameters.pressureSensorSerial}</Label>
                  <Input
                    value={pressureSensorSerial}
                    onChange={(e) => setPressureSensorSerial(e.target.value)}
                    placeholder="e.g., PS-001"
                    disabled={!connected}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.parameters.limpetSerial}</Label>
                  <Input
                    value={limpetSerial}
                    onChange={(e) => setLimpetSerial(e.target.value)}
                    placeholder="e.g., LP-001"
                    disabled={!connected}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">
                  {language === 'zh' 
                    ? '高级配置选项将在后续版本中添加。当前版本支持基础参数设置。' 
                    : 'Advanced configuration options will be added in future versions. Current version supports basic parameter settings.'}
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6 pt-6 border-t">
            <Button onClick={handleSave} disabled={!connected || saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? t.common.loading : t.parameters.saveToDevice}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {t.parameters.resetToDefault}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
