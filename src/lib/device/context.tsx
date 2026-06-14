'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import {
  connectToDevice,
  disconnectDevice,
  getDeviceInfo as fetchDeviceInfo,
  getBatteryVoltage,
  getTemperature,
  setToolSN as usbSetToolSN,
  setRunID as usbSetRunID,
  setCustomer as usbSetCustomer,
  setDistrict as usbSetDistrict,
  setCountry as usbSetCountry,
  setDepthOut as usbSetDepthOut,
  downloadOneSecondData,
  runSelfTest as usbRunSelfTest,
  initializeLogger,
  listDevices,
  isElectron,
  exportToCSV,
  type DeviceInfo,
  type OneSecondRecord,
  type SelfTestResult,
  type UsbDeviceInfo,
} from '../usb/procyon';

interface DeviceContextType {
  // Connection state
  connected: boolean;
  connecting: boolean;
  deviceInfo: DeviceInfo | null;
  error: string | null;

  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;

  // USB device scanning
  usbDevices: UsbDeviceInfo[];
  refreshDevices: () => Promise<void>;

  // Refresh device info
  refreshDeviceInfo: () => Promise<void>;

  // Parameter setters
  setToolSN: (sn: string) => Promise<void>;
  setRunID: (runId: string) => Promise<void>;
  setCustomer: (customer: string) => Promise<void>;
  setDistrict: (district: string) => Promise<void>;
  setCountry: (country: string) => Promise<void>;
  setDepthOut: (depth: number) => Promise<void>;

  // Data download
  downloadedData: OneSecondRecord[];
  downloadData: (onProgress?: (progress: number) => void) => Promise<void>;
  clearData: () => void;
  exportData: () => string;

  // System test
  testResults: SelfTestResult[];
  runSelfTest: () => Promise<void>;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usbDevices, setUsbDevices] = useState<UsbDeviceInfo[]>([]);
  const [downloadedData, setDownloadedData] = useState<OneSecondRecord[]>([]);
  const [testResults, setTestResults] = useState<SelfTestResult[]>([]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!isElectron()) return;
    try {
      const devices = await listDevices();
      setUsbDevices(devices);
    } catch {
      // Ignore errors during device scanning
    }
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const result = await connectToDevice();
      if (result.success) {
        setConnected(true);
        // Auto-fetch device info after connection
        try {
          const infoResult = await fetchDeviceInfo();
          if (infoResult.success && infoResult.info) {
            setDeviceInfo(infoResult.info);
          }
        } catch {
          // Ignore info fetch errors
        }
      } else {
        setError(result.error || 'Connection failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await disconnectDevice();
      setConnected(false);
      setDeviceInfo(null);
      setDownloadedData([]);
      setTestResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  }, []);

  const refreshDeviceInfo = useCallback(async () => {
    try {
      const result = await fetchDeviceInfo();
      if (result.success && result.info) {
        setDeviceInfo(result.info);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get device info');
    }
  }, []);

  const handleSetToolSN = useCallback(async (sn: string) => {
    try {
      const result = await usbSetToolSN(sn);
      if (!result.success) {
        setError(result.error || 'Set Tool SN failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Set Tool SN failed');
    }
  }, []);

  const handleSetRunID = useCallback(async (runId: string) => {
    try {
      const result = await usbSetRunID(runId);
      if (!result.success) {
        setError(result.error || 'Set Run ID failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Set Run ID failed');
    }
  }, []);

  const handleSetCustomer = useCallback(async (customer: string) => {
    try {
      const result = await usbSetCustomer(customer);
      if (!result.success) {
        setError(result.error || 'Set Customer failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Set Customer failed');
    }
  }, []);

  const handleSetDistrict = useCallback(async (district: string) => {
    try {
      const result = await usbSetDistrict(district);
      if (!result.success) {
        setError(result.error || 'Set District failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Set District failed');
    }
  }, []);

  const handleSetCountry = useCallback(async (country: string) => {
    try {
      const result = await usbSetCountry(country);
      if (!result.success) {
        setError(result.error || 'Set Country failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Set Country failed');
    }
  }, []);

  const handleSetDepthOut = useCallback(async (depth: number) => {
    try {
      const result = await usbSetDepthOut(depth);
      if (!result.success) {
        setError(result.error || 'Set Depth Out failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Set Depth Out failed');
    }
  }, []);

  const downloadData = useCallback(async (onProgress?: (progress: number) => void) => {
    setError(null);
    try {
      // Report initial progress
      onProgress?.(5);

      const result = await downloadOneSecondData();

      onProgress?.(90);

      if (result.success) {
        setDownloadedData(result.data);
        onProgress?.(100);
      } else {
        setError(result.error || 'Download failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }, []);

  const clearData = useCallback(() => {
    setDownloadedData([]);
  }, []);

  const exportData = useCallback(() => {
    return exportToCSV(downloadedData);
  }, [downloadedData]);

  const handleRunSelfTest = useCallback(async () => {
    try {
      const result = await usbRunSelfTest();
      if (result.success && result.results) {
        setTestResults(result.results);
      } else {
        setError(result.error || 'Self test failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Self test failed');
    }
  }, []);

  // Auto-refresh battery & temperature when connected
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(async () => {
      try {
        const battResult = await getBatteryVoltage();
        if (battResult.success && deviceInfo) {
          setDeviceInfo((prev) => prev ? { ...prev, batteryVoltage: battResult.voltage } : prev);
        }
        const tempResult = await getTemperature();
        if (tempResult.success && deviceInfo) {
          setDeviceInfo((prev) => prev ? { ...prev, temperature: tempResult.temperature } : prev);
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [connected, deviceInfo]);

  // Auto-scan for USB devices when in Electron
  useEffect(() => {
    if (!isElectron()) return;
    refreshDevices();
    const interval = setInterval(refreshDevices, 3000);
    return () => clearInterval(interval);
  }, [refreshDevices]);

  const contextValue: DeviceContextType = {
    connected,
    connecting,
    deviceInfo,
    error,
    connect,
    disconnect,
    clearError,
    usbDevices,
    refreshDevices,
    refreshDeviceInfo,
    setToolSN: handleSetToolSN,
    setRunID: handleSetRunID,
    setCustomer: handleSetCustomer,
    setDistrict: handleSetDistrict,
    setCountry: handleSetCountry,
    setDepthOut: handleSetDepthOut,
    downloadedData,
    downloadData,
    clearData,
    exportData,
    testResults,
    runSelfTest: handleRunSelfTest,
  };

  return (
    <DeviceContext.Provider value={contextValue}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice(): DeviceContextType {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevice must be used within DeviceProvider');
  }
  return context;
}
