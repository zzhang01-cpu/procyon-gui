'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
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
  setLDAP as usbSetLDAP,
  setToolType as usbSetToolType,
  setToolPosition as usbSetToolPosition,
  setToolSize as usbSetToolSize,
  setConfigName as usbSetConfigName,
  setUniqueID as usbSetUniqueID,
  setRunIDType as usbSetRunIDType,
  setUHConnectionType as usbSetUHConnectionType,
  setDHConnectionType as usbSetDHConnectionType,
  setIntPressureSN as usbSetIntPressureSN,
  setExtPressureSN as usbSetExtPressureSN,
  setLimpetSN as usbSetLimpetSN,
  setDeviceTime as usbSetDeviceTime,
  writeIntoFlash as usbWriteIntoFlash,
  downloadData as usbDownloadData,
  onDownloadProgress,
  runSelfTest as usbRunSelfTest,
  onSelfTestProgress,
  initializeLogger as usbInitializeLogger,
  onInitProgress,
  launchDevice as usbLaunchDevice,
  eraseMemory as usbEraseMemory,
  listDevices,
  isElectron,
  exportToCSV,
  getAllParameters,
  getSensorData as usbGetSensorData,
  type DeviceInfo,
  type OneSecondRecord,
  type SelfTestResult,
  type SelfTestSummary,
  type DownloadProgress,
  type InitProgress,
  type SelfTestProgress,
  type DownloadResult,
  type UsbDeviceInfo,
  parseBinaryRecords,
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

  // Device parameters (read from device)
  deviceParams: Record<string, string>;
  loadDeviceParams: () => Promise<void>;

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
  setLDAP: (ldap: string) => Promise<void>;
  setToolType: (toolType: string) => Promise<void>;
  setToolPosition: (position: string) => Promise<void>;
  setToolSize: (size: string) => Promise<void>;
  setConfigName: (configName: string) => Promise<void>;
  setUniqueID: (uniqueId: string) => Promise<void>;
  setRunIDType: (runIdType: string) => Promise<void>;
  setUHConnectionType: (connType: string) => Promise<void>;
  setDHConnectionType: (connType: string) => Promise<void>;
  setIntPressureSN: (sn: string) => Promise<void>;
  setExtPressureSN: (sn: string) => Promise<void>;
  setLimpetSN: (sn: string) => Promise<void>;
  setDeviceTime: () => Promise<void>;

  // Flash write
  writeIntoFlash: () => Promise<boolean>;

  // Initialize logger (full init flow: set params + check battery + erase + flash)
  initializeLogger: (params: Record<string, string>, eraseMemory?: boolean) => Promise<{
    success: boolean;
    steps?: Array<{ name: string; success: boolean; detail?: string }>;
    error?: string;
  }>;
  initProgress: InitProgress | null;

  // Data download
  downloadedData: OneSecondRecord[];
  downloadResult: DownloadResult | null;
  downloadProgress: DownloadProgress | null;
  downloadData: () => Promise<DownloadResult>;
  clearData: () => void;
  exportData: () => Promise<string>;

  // System test
  testResults: SelfTestResult[];
  testSummary: SelfTestSummary | null;
  selfTestProgress: SelfTestProgress | null;
  runSelfTest: (tests?: string[]) => Promise<void>;

  // Launch device (delayed start)
  launchDevice: (delaySeconds?: number) => Promise<{ success: boolean; detail?: string; error?: string }>;

  // Erase memory
  eraseMemory: (eraseAll: boolean) => Promise<{ success: boolean; error?: string }>;

  // Real-time sensor data
  getSensorData: () => Promise<Record<string, string>>;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usbDevices, setUsbDevices] = useState<UsbDeviceInfo[]>([]);
  const [downloadedData, setDownloadedData] = useState<OneSecondRecord[]>([]);
  const [downloadResult, setDownloadResult] = useState<DownloadResult | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [testResults, setTestResults] = useState<SelfTestResult[]>([]);
  const [testSummary, setTestSummary] = useState<SelfTestSummary | null>(null);
  const [selfTestProgress, setSelfTestProgress] = useState<SelfTestProgress | null>(null);
  const [deviceParams, setDeviceParams] = useState<Record<string, string>>({});
  const [initProgress, setInitProgress] = useState<InitProgress | null>(null);

  // Cleanup refs for event listeners
  const cleanupDownloadRef = useRef<(() => void) | null>(null);
  const cleanupSelfTestRef = useRef<(() => void) | null>(null);
  const cleanupInitRef = useRef<(() => void) | null>(null);

  // Setup progress listeners
  useEffect(() => {
    if (!isElectron()) return;
    cleanupDownloadRef.current = onDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });
    cleanupSelfTestRef.current = onSelfTestProgress((progress) => {
      setSelfTestProgress(progress);
    });
    cleanupInitRef.current = onInitProgress((progress) => {
      setInitProgress(progress);
    });
    return () => {
      cleanupDownloadRef.current?.();
      cleanupSelfTestRef.current?.();
      cleanupInitRef.current?.();
    };
  }, []);

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
        // Auto-fetch device parameters
        try {
          const paramResult = await getAllParameters();
          if (paramResult.success && paramResult.params) {
            setDeviceParams(paramResult.params);
          }
        } catch {
          // Ignore parameter fetch errors
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
      setDownloadResult(null);
      setTestResults([]);
      setTestSummary(null);
      setDeviceParams({});
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

  // Helper to wrap USB setter with error handling
  const createSetter = useCallback(<T extends unknown[]>(fn: (...args: T) => Promise<{ success: boolean; error?: string }>, label: string) => {
    return async (...args: T) => {
      try {
        const result = await fn(...args);
        if (!result.success) {
          setError(result.error || label + ' failed');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : label + ' failed');
      }
    };
  }, []);

  const handleSetToolSN = useCallback((sn: string) => createSetter(usbSetToolSN, 'Set Tool SN')(sn), [createSetter]);
  const handleSetRunID = useCallback((runId: string) => createSetter(usbSetRunID, 'Set Run ID')(runId), [createSetter]);
  const handleSetCustomer = useCallback((customer: string) => createSetter(usbSetCustomer, 'Set Customer')(customer), [createSetter]);
  const handleSetDistrict = useCallback((district: string) => createSetter(usbSetDistrict, 'Set District')(district), [createSetter]);
  const handleSetCountry = useCallback((country: string) => createSetter(usbSetCountry, 'Set Country')(country), [createSetter]);
  const handleSetDepthOut = useCallback((depth: number) => createSetter(usbSetDepthOut, 'Set Depth Out')(depth), [createSetter]);
  const handleSetLDAP = useCallback((ldap: string) => createSetter(usbSetLDAP, 'Set LDAP')(ldap), [createSetter]);
  const handleSetToolType = useCallback((toolType: string) => createSetter(usbSetToolType, 'Set Tool Type')(toolType), [createSetter]);
  const handleSetToolPosition = useCallback((position: string) => createSetter(usbSetToolPosition, 'Set Tool Position')(position), [createSetter]);
  const handleSetToolSize = useCallback((size: string) => createSetter(usbSetToolSize, 'Set Tool Size')(size), [createSetter]);
  const handleSetConfigName = useCallback((configName: string) => createSetter(usbSetConfigName, 'Set Config Name')(configName), [createSetter]);
  const handleSetUniqueID = useCallback((uniqueId: string) => createSetter(usbSetUniqueID, 'Set Unique ID')(uniqueId), [createSetter]);
  const handleSetRunIDType = useCallback((runIdType: string) => createSetter(usbSetRunIDType, 'Set Run ID Type')(runIdType), [createSetter]);
  const handleSetUHConnectionType = useCallback((connType: string) => createSetter(usbSetUHConnectionType, 'Set UH Connection Type')(connType), [createSetter]);
  const handleSetDHConnectionType = useCallback((connType: string) => createSetter(usbSetDHConnectionType, 'Set DH Connection Type')(connType), [createSetter]);
  const handleSetIntPressureSN = useCallback((sn: string) => createSetter(usbSetIntPressureSN, 'Set Int Pressure SN')(sn), [createSetter]);
  const handleSetExtPressureSN = useCallback((sn: string) => createSetter(usbSetExtPressureSN, 'Set Ext Pressure SN')(sn), [createSetter]);
  const handleSetLimpetSN = useCallback((sn: string) => createSetter(usbSetLimpetSN, 'Set Limpet SN')(sn), [createSetter]);
  const handleSetDeviceTime = useCallback(async () => {
    try {
      const result = await usbSetDeviceTime();
      if (!result.success) {
        setError(result.error || 'Set Device Time failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Set Device Time failed');
    }
  }, []);

  const handleWriteIntoFlash = useCallback(async (): Promise<boolean> => {
    try {
      const result = await usbWriteIntoFlash();
      if (!result.success) {
        setError(result.error || 'Write Into Flash failed');
        return false;
      }
      return result.success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Write Into Flash failed');
      return false;
    }
  }, []);

  const handleInitializeLogger = useCallback(async (params: Record<string, string>, eraseMem?: boolean) => {
    setInitProgress({ step: 'Starting...', status: 'running' });
    setError(null);
    try {
      const result = await usbInitializeLogger(params, eraseMem);
      if (!result.success) {
        setError(result.error || 'Initialize Logger failed');
      }
      setInitProgress(null);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Initialize Logger failed';
      setError(errMsg);
      setInitProgress(null);
      return { success: false, error: errMsg };
    }
  }, []);

  const handleDownloadData = useCallback(async (): Promise<DownloadResult> => {
    setError(null);
    setDownloadProgress({ partition: 0, totalPartitions: 0, chunk: 0, totalChunks: 0, percent: 0 });
    try {
      const result = await usbDownloadData();
      if (result.success) {
        setDownloadResult(result);
        // Records are stored in main process. Only summary is returned via IPC.
        const parseDebug = (result as any).parseDebug as string[] || [];
        const chunkReadDebug = (result as any).chunkReadDebug as string[] || [];
        const recordCount = (result as any).recordCount as number || 0;
        const summary = (result as any).recordSummary as string || '';
        console.log('[Download] Records parsed:', recordCount, summary);
        for (const line of parseDebug) {
          console.log('[Download] ' + line);
        }
        for (const line of chunkReadDebug) {
          console.log('[Download CHUNK] ' + line);
        }
        // Store debug info for page display
        (result as any).partitionDebugInfo = [...parseDebug, ...chunkReadDebug];
        // Store record count instead of full records (records stay in main process)
        (result as any).recordCount = recordCount;
        setDownloadedData(recordCount > 0 ? [{ _count: recordCount } as any] : []);
      } else {
        setError(result.error || 'Download failed');
      }
      setDownloadProgress(null);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Download failed';
      setError(errMsg);
      setDownloadProgress(null);
      return { success: false, partitions: [], totalPartitions: 0, error: errMsg };
    }
  }, []);

  const clearData = useCallback(() => {
    setDownloadedData([]);
    setDownloadResult(null);
    setDownloadProgress(null);
  }, []);

  const exportData = useCallback(async (): Promise<string> => {
    if (!isElectron()) return '';
    try {
      const csv = await (window as any).electronAPI.exportData();
      return csv || '';
    } catch {
      // Fallback: empty
      return '';
    }
  }, []);

  const loadDeviceParams = useCallback(async () => {
    if (!isElectron()) return;
    try {
      const result = await getAllParameters();
      if (result.success && result.params) {
        setDeviceParams(result.params);
      }
    } catch {
      // Ignore parameter loading errors
    }
  }, []);

  const handleRunSelfTest = useCallback(async (tests?: string[]) => {
    setError(null);
    setSelfTestProgress({ current: 0, total: 0, testId: '', testName: '', status: 'starting' });
    try {
      const result = await usbRunSelfTest(tests);
      if (result.success && result.results) {
        setTestResults(result.results);
        setTestSummary(result.summary || null);
      } else {
        setError(result.error || 'Self test failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Self test failed');
    } finally {
      setSelfTestProgress(null);
    }
  }, []);

  const handleLaunchDevice = useCallback(async (delaySeconds?: number) => {
    try {
      return await usbLaunchDevice(delaySeconds);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Launch device failed';
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  }, []);

  const handleEraseMemory = useCallback(async (eraseAll: boolean) => {
    try {
      return await usbEraseMemory(eraseAll);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Erase memory failed';
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  }, []);

  // Auto-refresh battery & temperature when connected
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(async () => {
      try {
        const battResult = await getBatteryVoltage();
        if (battResult.success) {
          setDeviceInfo((prev) => prev ? { ...prev, batteryVoltage: battResult.rawMv || battResult.voltage } : prev);
        }
        const tempResult = await getTemperature();
        if (tempResult.success) {
          setDeviceInfo((prev) => prev ? { ...prev, temperature: tempResult.temperature } : prev);
        }
      } catch {
        // Ignore polling errors
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [connected]);

  // Auto-scan for USB devices when in Electron
  useEffect(() => {
    if (!isElectron()) return;
    refreshDevices();
    const interval = setInterval(refreshDevices, 10000);
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
    deviceParams,
    loadDeviceParams,
    refreshDeviceInfo,
    setToolSN: handleSetToolSN,
    setRunID: handleSetRunID,
    setCustomer: handleSetCustomer,
    setDistrict: handleSetDistrict,
    setCountry: handleSetCountry,
    setDepthOut: handleSetDepthOut,
    setLDAP: handleSetLDAP,
    setToolType: handleSetToolType,
    setToolPosition: handleSetToolPosition,
    setToolSize: handleSetToolSize,
    setConfigName: handleSetConfigName,
    setUniqueID: handleSetUniqueID,
    setRunIDType: handleSetRunIDType,
    setUHConnectionType: handleSetUHConnectionType,
    setDHConnectionType: handleSetDHConnectionType,
    setIntPressureSN: handleSetIntPressureSN,
    setExtPressureSN: handleSetExtPressureSN,
    setLimpetSN: handleSetLimpetSN,
    setDeviceTime: handleSetDeviceTime,
    writeIntoFlash: handleWriteIntoFlash,
    initializeLogger: handleInitializeLogger,
    initProgress,
    downloadedData,
    downloadResult,
    downloadProgress,
    downloadData: handleDownloadData,
    clearData,
    exportData,
    testResults,
    testSummary,
    selfTestProgress,
    runSelfTest: handleRunSelfTest,
    launchDevice: handleLaunchDevice,
    eraseMemory: handleEraseMemory,
    getSensorData: usbGetSensorData,
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
