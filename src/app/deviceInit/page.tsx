'use client';

import React, { useState, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useDevice } from '@/lib/device/context';
import { Button } from '@/components/ui/button';
import { Check, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface DeviceInitPageProps {
  onNavigate: (page: string) => void;
}

const STEPS = ['jobInformation', 'toolInformation', 'deviceInformation'] as const;
type Step = (typeof STEPS)[number];

const CUSTOMER_OPTIONS = [
  'EOG RES',
  'CHEVRON',
  'EXXONMOBIL',
  'CONOCOPHILLIPS',
  'OCCIDENTAL',
  'BP',
  'SHELL',
  'TOTAL',
  'OTHER',
];

const COUNTRY_OPTIONS = [
  'TRINIDAD AND TOBAGO',
  'UNITED STATES',
  'CANADA',
  'MEXICO',
  'COLOMBIA',
  'ARGENTINA',
  'BRAZIL',
  'OTHER',
];

const DISTRICT_OPTIONS = [
  'TRINIDAD DISTRICT',
  'HOUSTON DISTRICT',
  'PERMIAN DISTRICT',
  'GULF COAST DISTRICT',
  'OTHER',
];

const TOOL_TYPE_OPTIONS = ['Bit', 'Stabilizer', 'MWD', 'LWD'];
const TOOL_POSITION_OPTIONS = ['at_tool', 'above_tool', 'below_tool'];
const AXIAL_POSITION_OPTIONS = ['Center', 'Top', 'Bottom'];
const TOOL_SIZE_OPTIONS = ['3.5', '4.5', '6.625', '7.625', '8.5', '9.5', '12.25'];

export default function DeviceInitPage({ onNavigate }: DeviceInitPageProps) {
  const { t } = useI18n();
  const { connected, deviceInfo, setToolSN } = useDevice();
  const [currentStep, setCurrentStep] = useState<Step>('jobInformation');
  const [initializing, setInitializing] = useState(false);
  const [initComplete, setInitComplete] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Job Information
  const [customer, setCustomer] = useState('');
  const [country, setCountry] = useState('');
  const [district, setDistrict] = useState('');

  // Tool Information
  const [toolType, setToolType] = useState('Bit');
  const [toolPosition, setToolPosition] = useState('at_tool');
  const [axialPosition, setAxialPosition] = useState('Center');
  const [toolSize, setToolSize] = useState('8.5');

  // Device Information
  const [toolSN, setToolSNLocal] = useState(deviceInfo?.serialNumber || '');
  const [housingSN, setHousingSN] = useState('');
  const [bitSerial, setBitSerial] = useState('');
  const [preDefinedJob, setPreDefinedJob] = useState(true);

  const stepIndex = STEPS.indexOf(currentStep);

  const canNext = (): boolean => {
    if (currentStep === 'jobInformation') {
      return customer !== '' && country !== '' && district !== '';
    }
    if (currentStep === 'toolInformation') {
      return toolType !== '' && toolSize !== '';
    }
    if (currentStep === 'deviceInformation') {
      return toolSN !== '';
    }
    return false;
  };

  const handleNext = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) {
      setCurrentStep(STEPS[idx + 1]);
    }
  };

  const handleBack = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(STEPS[idx - 1]);
    }
  };

  const handleInitialize = useCallback(async () => {
    if (!connected) return;
    setInitializing(true);
    setInitError(null);

    try {
      // Set Tool SN
      if (toolSN) {
        await setToolSN(toolSN);
      }

      // In a full implementation, this would send all parameters to the device
      // and then call writeIntoFlash()
      // For now, simulate with a delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      setInitComplete(true);
    } catch (err) {
      setInitError(err instanceof Error ? err.message : 'Initialization failed');
    } finally {
      setInitializing(false);
    }
  }, [connected, toolSN, setToolSN]);

  if (initComplete) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            {t.deviceInit.initializationComplete}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {t.deviceInit.initSuccessMessage}
          </p>
          <Button onClick={() => onNavigate('home')} className="bg-blue-600 hover:bg-blue-700">
            {t.deviceInit.returnHome}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Pre-Defined Job Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">{t.deviceInit.title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {preDefinedJob ? t.deviceInit.preDefinedJobOn : t.deviceInit.preDefinedJobOff}
          </span>
          <button
            onClick={() => setPreDefinedJob(!preDefinedJob)}
            className={`w-10 h-5 rounded-full transition-colors relative ${
              preDefinedJob ? 'bg-blue-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                preDefinedJob ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Step Progress */}
      <div className="flex items-center mb-6">
        {STEPS.map((step, idx) => {
          const isActive = step === currentStep;
          const isCompleted = idx < stepIndex;
          return (
            <React.Fragment key={step}>
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <span
                  className={`text-xs ${
                    isActive ? 'text-blue-600 font-semibold' : isCompleted ? 'text-green-600' : 'text-slate-400'
                  }`}
                >
                  {t.deviceInit[step]}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-3 ${
                    idx < stepIndex ? 'bg-green-500' : 'bg-slate-200'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-4">
        {currentStep === 'jobInformation' && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">{t.deviceInit.jobInformation}</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Customer</label>
                <select
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {CUSTOMER_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">District</label>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {DISTRICT_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'toolInformation' && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">{t.deviceInit.toolInformation}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Tool Type</label>
                <select
                  value={toolType}
                  onChange={(e) => setToolType(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TOOL_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Tool Position</label>
                <select
                  value={toolPosition}
                  onChange={(e) => setToolPosition(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TOOL_POSITION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Axial Position</label>
                <select
                  value={axialPosition}
                  onChange={(e) => setAxialPosition(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {AXIAL_POSITION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Tool Size</label>
                <select
                  value={toolSize}
                  onChange={(e) => setToolSize(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TOOL_SIZE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'deviceInformation' && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">{t.deviceInit.deviceInformation}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Bit Serial</label>
                  <input
                    type="text"
                    value={bitSerial}
                    onChange={(e) => setBitSerial(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter bit serial"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t.deviceInit.housingSN}</label>
                  <input
                    type="text"
                    value={housingSN}
                    onChange={(e) => setHousingSN(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter housing SN"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{t.deviceInit.toolSN}</label>
                  <input
                    type="text"
                    value={toolSN}
                    onChange={(e) => setToolSNLocal(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter tool SN"
                  />
                </div>
              </div>

              {/* Summary of all steps */}
              <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-200">
                <h4 className="text-xs font-semibold text-slate-600 mb-2">{t.deviceInit.summary}</h4>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>Customer: <strong className="text-slate-700">{customer}</strong></span>
                  <span>Country: <strong className="text-slate-700">{country}</strong></span>
                  <span>District: <strong className="text-slate-700">{district}</strong></span>
                  <span>Tool Type: <strong className="text-slate-700">{toolType}</strong></span>
                  <span>Tool Size: <strong className="text-slate-700">{toolSize}</strong></span>
                  <span>Position: <strong className="text-slate-700">{toolPosition}</strong></span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {initError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {initError}
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 'jobInformation'}
          className="flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          {t.deviceInit.back}
        </Button>

        <div className="flex gap-2">
          {currentStep !== 'deviceInformation' ? (
            <Button
              onClick={handleNext}
              disabled={!canNext()}
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
            >
              {t.deviceInit.next}
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleInitialize}
              disabled={!canNext() || initializing || !connected}
              className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
            >
              {initializing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t.deviceInit.initializing}
                </>
              ) : (
                t.deviceInit.initializeLogger
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
