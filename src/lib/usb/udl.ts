/**
 * UDL (Unified Data Logger) Device Communication Layer (Renderer Process)
 * Uses Electron IPC to communicate with the main process UDL USB bridge (libusb-1.0)
 * 
 * Supports multiple device types: CM, EM, Retina, RetinaMini
 * New features: FastDump, ECC, EnterCommScope, Magnetometer, StrainMeasurement, etc.
 */

export interface UdlDeviceInfo {
  firmwareVersion: string;
  hardwareVersion: string;
  toolSN: string;
  uniqueId: string;
  deviceType: 'cm' | 'em' | 'retina' | 'retina_mini' | 'unknown';
  deviceName: string;
  batteryVoltage: number;
  temperature?: number;
  serialNumber?: string;
  commScopeActive?: boolean;
  selfTestModeActive?: boolean;
}

export interface UdlUsbDeviceInfo {
  vendorId: number;
  productId: number;
  deviceAddress: number;
  busNumber: number;
  devicePath?: string;
  serialNumber?: string;
  manufacturer?: string;
  product?: string;
  isUdlDevice: boolean;
  deviceType?: 'cm' | 'em' | 'retina' | 'retina_mini' | 'unknown';
}

export interface UdlSensorData {
  // CM sensors
  rotational?: {
    rpmX: { min: number; max: number; avg: number; rms: number };
    rpmY: { min: number; max: number; avg: number; rms: number };
    rpmZ: { min: number; max: number; avg: number; rms: number };
  };
  lowShock?: {
    shockX: { min: number; max: number; avg: number; rms: number };
    shockY: { min: number; max: number; avg: number; rms: number };
    shockZ: { min: number; max: number; avg: number; rms: number };
  };
  highShock?: {
    shockX: { min: number; max: number; avg: number; rms: number };
    shockY: { min: number; max: number; avg: number; rms: number };
    shockZ: { min: number; max: number; avg: number; rms: number };
  };
  pressure?: {
    psiMin: number;
    psiMax: number;
    psiAvg: number;
  };
  temperatureCm?: number;
  temperatureEm?: number;
  // EM sensors
  gyro?: {
    gyroX: { min: number; max: number; avg: number };
    gyroY: { min: number; max: number; avg: number };
    gyroZ: { min: number; max: number; avg: number };
  };
  accelerometer?: {
    accelX: { min: number; max: number; avg: number };
    accelY: { min: number; max: number; avg: number };
    accelZ: { min: number; max: number; avg: number };
  };
  pressureEm?: {
    intPressure: { min: number; max: number; avg: number };
    extPressure: { min: number; max: number; avg: number };
  };
  limpet?: {
    ch1: { min: number; max: number; avg: number };
    ch2: { min: number; max: number; avg: number };
    ch3: { min: number; max: number; avg: number };
    ch4: { min: number; max: number; avg: number };
    ch5: { min: number; max: number; avg: number };
  };
  // New UDL sensors
  magnetometer?: {
    magX: number;
    magY: number;
    magZ: number;
  };
  strain?: Record<string, number>;
  pwasn?: Record<string, number>;
}

export interface UdlSelfTestResult {
  testId: string;
  testName: string;
  passed: boolean;
  rawData?: number[];
  detail?: string;
}

export interface UdlSelfTestProgress {
  current: number;
  total: number;
  testId: string;
  status: string;
}

export interface UdlDownloadProgress {
  partition: number;
  totalPartitions: number;
  chunk: number;
  totalChunks: number;
  percent: number;
  bytesRead: number;
  totalBytes: number;
  phase: 'starting' | 'dumping' | 'finishing' | 'error';
  fastDump?: boolean;
}

export interface UdlDownloadResult {
  success: boolean;
  partitions: Array<{
    partition: number;
    data: Uint8Array;
    size: number;
    chunksRead: number;
    totalChunks: number;
  }>;
  totalPartitions: number;
  totalBytes: number;
  error?: string;
  fastDumpUsed: boolean;
  durationMs: number;
}

export interface UdlInitProgress {
  step: number;
  totalSteps: number;
  stepName: string;
  percent: number;
}

export interface UdlInitResult {
  success: boolean;
  detail?: string;
  error?: string;
  steps: string[];
}

/**
 * Get the Electron API from the preload script
 */
function getAPI(): Record<string, (...args: unknown[]) => Promise<unknown>> | null {
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).electronAPI) {
    return (window as unknown as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).electronAPI;
  }
  return null;
}

/**
 * Check if running in Electron with UDL support
 */
export function isUdlSupported(): boolean {
  const api = getAPI();
  return !!api && typeof api.getActiveBridge === 'function';
}

/**
 * Get the currently active bridge type
 */
export async function getActiveBridge(): Promise<'legacy' | 'udl'> {
  const api = getAPI();
  if (!api || typeof api.getActiveBridge !== 'function') {
    return 'legacy';
  }
  const result = await api.getActiveBridge();
  return (result as { type: string }).type as 'legacy' | 'udl';
}

/**
 * Switch to a specific bridge
 */
export async function switchBridge(bridgeType: 'legacy' | 'udl'): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api || typeof api.switchBridge !== 'function') {
    return { success: false, error: 'Bridge switching not supported' };
  }
  return api.switchBridge(bridgeType) as Promise<{ success: boolean; error?: string }>;
}

/**
 * List all USB devices (UDL bridge)
 */
export async function udlListDevices(): Promise<UdlUsbDeviceInfo[]> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  const result = await api.udlListDevices();
  return (result as { devices: UdlUsbDeviceInfo[] }).devices;
}

/**
 * Connect to a UDL device
 */
export async function udlConnect(devicePath?: string): Promise<{
  success: boolean;
  info?: UdlDeviceInfo;
  error?: string;
}> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.udlConnect(devicePath) as Promise<{
    success: boolean;
    info?: UdlDeviceInfo;
    error?: string;
  }>;
}

/**
 * Disconnect from UDL device
 */
export async function udlDisconnect(): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.udlDisconnect() as Promise<{ success: boolean; error?: string }>;
}

/**
 * Check if device is connected via UDL bridge
 */
export async function udlIsConnected(): Promise<boolean> {
  const api = getAPI();
  if (!api || typeof api.udlIsConnected !== 'function') {
    return false;
  }
  const result = await api.udlIsConnected();
  return (result as { connected: boolean }).connected;
}

/**
 * Get device info via UDL bridge
 */
export async function udlGetDeviceInfo(): Promise<{
  success: boolean;
  info?: UdlDeviceInfo;
  error?: string;
}> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.udlGetDeviceInfo() as Promise<{
    success: boolean;
    info?: UdlDeviceInfo;
    error?: string;
  }>;
}

/**
 * Get battery voltage
 */
export async function udlGetBatteryVoltage(): Promise<{ success: boolean; voltage?: number; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlGetBatteryVoltage() as Promise<{ success: boolean; voltage?: number; error?: string }>;
}

/**
 * Get device time
 */
export async function udlGetDeviceTime(): Promise<{ success: boolean; time?: number; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlGetDeviceTime() as Promise<{ success: boolean; time?: number; error?: string }>;
}

/**
 * Set device time
 */
export async function udlSetDeviceTime(timestamp?: number): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  return api.udlSetDeviceTime(ts) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Enter Comm Scope (UDL new feature - unlocks advanced commands)
 */
export async function udlEnterCommScope(): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlEnterCommScope() as Promise<{ success: boolean; error?: string }>;
}

/**
 * Exit Comm Scope
 */
export async function udlExitCommScope(): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlExitCommScope() as Promise<{ success: boolean; error?: string }>;
}

/**
 * Get sensor data (all sensors)
 */
export async function udlGetSensorData(): Promise<{ success: boolean; data?: UdlSensorData; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlGetSensorData() as Promise<{ success: boolean; data?: UdlSensorData; error?: string }>;
}

/**
 * Get all device parameters
 */
export async function udlGetAllParameters(): Promise<{ success: boolean; params?: Record<string, string>; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlGetAllParameters() as Promise<{ success: boolean; params?: Record<string, string>; error?: string }>;
}

/**
 * Set a device parameter
 */
export async function udlSetParameter(paramName: string, value: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlSetParameter(paramName, value) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Write parameters into flash
 */
export async function udlWriteIntoFlash(): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlWriteIntoFlash() as Promise<{ success: boolean; error?: string }>;
}

/**
 * Initialize logger (full init flow)
 */
export async function udlInitializeLogger(
  params: Record<string, string>,
  eraseMemory?: boolean
): Promise<UdlInitResult> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlInitializeLogger(params, eraseMemory ?? false) as Promise<UdlInitResult>;
}

/**
 * Listen for init progress
 */
export function udlOnInitProgress(callback: (progress: UdlInitProgress) => void): () => void {
  const api = getAPI();
  if (!api || typeof api.udlOnInitProgress !== 'function') {
    return () => {};
  }
  const cleanup = api.udlOnInitProgress(callback as (...args: unknown[]) => void) as unknown as () => void;
  return typeof cleanup === 'function' ? cleanup : () => {};
}

/**
 * Download data from device (supports FastDump)
 */
export async function udlDownloadData(useFastDump = true): Promise<UdlDownloadResult> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlDownloadData(useFastDump) as Promise<UdlDownloadResult>;
}

/**
 * Listen for download progress
 */
export function udlOnDownloadProgress(callback: (progress: UdlDownloadProgress) => void): () => void {
  const api = getAPI();
  if (!api || typeof api.udlOnDownloadProgress !== 'function') {
    return () => {};
  }
  const cleanup = api.udlOnDownloadProgress(callback as (...args: unknown[]) => void) as unknown as () => void;
  return typeof cleanup === 'function' ? cleanup : () => {};
}

/**
 * Run self test
 */
export async function udlRunSelfTest(tests?: string[]): Promise<{
  success: boolean;
  results?: UdlSelfTestResult[];
  error?: string;
}> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlRunSelfTest(tests ?? []) as Promise<{
    success: boolean;
    results?: UdlSelfTestResult[];
    error?: string;
  }>;
}

/**
 * Listen for self test progress
 */
export function udlOnSelfTestProgress(callback: (progress: UdlSelfTestProgress) => void): () => void {
  const api = getAPI();
  if (!api || typeof api.udlOnSelfTestProgress !== 'function') {
    return () => {};
  }
  const cleanup = api.udlOnSelfTestProgress(callback as (...args: unknown[]) => void) as unknown as () => void;
  return typeof cleanup === 'function' ? cleanup : () => {};
}

/**
 * Launch device (delayed start)
 */
export async function udlLaunchDevice(): Promise<{ success: boolean; detail?: string; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlLaunchDevice() as Promise<{ success: boolean; detail?: string; error?: string }>;
}

/**
 * Erase memory
 */
export async function udlEraseMemory(eraseAll: boolean): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlEraseMemory(eraseAll) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Get erase progress
 */
export async function udlGetEraseProgress(): Promise<{ success: boolean; percent?: number; error?: string }> {
  const api = getAPI();
  if (!api) throw new Error('Not running in Electron environment');
  return api.udlGetEraseProgress() as Promise<{ success: boolean; percent?: number; error?: string }>;
}
