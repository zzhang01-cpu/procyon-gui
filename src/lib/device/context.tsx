'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ProcyonUSB, DeviceInfo, OneSecondData, TestResult } from '@/lib/usb/procyon';

interface DeviceContextType {
  device: ProcyonUSB | null;
  connected: boolean;
  connecting: boolean;
  deviceInfo: DeviceInfo | null;
  downloadedData: OneSecondData[];
  testResults: TestResult[];
  error: string | null;
  connect: (vendorId?: number, productId?: number) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshDeviceInfo: () => Promise<void>;
  downloadData: (onProgress?: (progress: number) => void) => Promise<void>;
  runSelfTest: () => Promise<void>;
  setToolSN: (sn: string) => Promise<void>;
  setRunID: (id: string) => Promise<void>;
  setCustomer: (customer: string) => Promise<void>;
  setDistrict: (district: string) => Promise<void>;
  setCountry: (country: string) => Promise<void>;
  setDepthOut: (depth: number) => Promise<void>;
  clearError: () => void;
  clearData: () => void;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<ProcyonUSB | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [downloadedData, setDownloadedData] = useState<OneSecondData[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const clearData = useCallback(() => setDownloadedData([]), []);

  const connect = useCallback(async (vendorId?: number, productId?: number) => {
    if (connecting || connected) return;

    setConnecting(true);
    setError(null);

    try {
      const usb = new ProcyonUSB(vendorId, productId);
      await usb.connect();
      
      usb.onDisconnect(() => {
        setConnected(false);
        setDeviceInfo(null);
        setDevice(null);
      });

      setDevice(usb);
      setConnected(true);

      // Get device info after connection
      const info = await usb.getDeviceInfo();
      setDeviceInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [connecting, connected]);

  const disconnect = useCallback(async () => {
    if (!device || !connected) return;

    try {
      await device.disconnect();
      setConnected(false);
      setDeviceInfo(null);
      setDevice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnection failed');
    }
  }, [device, connected]);

  const refreshDeviceInfo = useCallback(async () => {
    if (!device || !connected) return;

    try {
      const info = await device.getDeviceInfo();
      setDeviceInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh device info');
    }
  }, [device, connected]);

  const downloadData = useCallback(async (onProgress?: (progress: number) => void) => {
    if (!device || !connected) {
      setError('Device not connected');
      return;
    }

    try {
      const data = await device.downloadOneSecondData(onProgress);
      setDownloadedData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }, [device, connected]);

  const runSelfTest = useCallback(async () => {
    if (!device || !connected) {
      setError('Device not connected');
      return;
    }

    try {
      const results = await device.runSelfTest();
      setTestResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Self-test failed');
    }
  }, [device, connected]);

  const setToolSN = useCallback(async (sn: string) => {
    if (!device || !connected) {
      setError('Device not connected');
      return;
    }
    try {
      await device.setToolSN(sn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set tool SN');
    }
  }, [device, connected]);

  const setRunID = useCallback(async (id: string) => {
    if (!device || !connected) {
      setError('Device not connected');
      return;
    }
    try {
      await device.setRunID(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set run ID');
    }
  }, [device, connected]);

  const setCustomer = useCallback(async (customer: string) => {
    if (!device || !connected) {
      setError('Device not connected');
      return;
    }
    try {
      await device.setCustomer(customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set customer');
    }
  }, [device, connected]);

  const setDistrict = useCallback(async (district: string) => {
    if (!device || !connected) {
      setError('Device not connected');
      return;
    }
    try {
      await device.setDistrict(district);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set district');
    }
  }, [device, connected]);

  const setCountry = useCallback(async (country: string) => {
    if (!device || !connected) {
      setError('Device not connected');
      return;
    }
    try {
      await device.setCountry(country);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set country');
    }
  }, [device, connected]);

  const setDepthOut = useCallback(async (depth: number) => {
    if (!device || !connected) {
      setError('Device not connected');
      return;
    }
    try {
      await device.setDepthOut(depth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set depth out');
    }
  }, [device, connected]);

  return (
    <DeviceContext.Provider
      value={{
        device,
        connected,
        connecting,
        deviceInfo,
        downloadedData,
        testResults,
        error,
        connect,
        disconnect,
        refreshDeviceInfo,
        downloadData,
        runSelfTest,
        setToolSN,
        setRunID,
        setCustomer,
        setDistrict,
        setCountry,
        setDepthOut,
        clearError,
        clearData,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevice must be used within DeviceProvider');
  }
  return context;
}
