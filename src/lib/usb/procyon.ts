/**
 * Procyon Device Communication Layer (Renderer Process)
 * Uses Electron IPC to communicate with the main process USB bridge
 */

export interface DeviceInfo {
  firmwareVersion: string;
  toolSN: string;
  uniqueId: string;
  batteryVoltage: number;
  temperature?: number;
  serialNumber?: string;
}

export interface UsbDeviceInfo {
  vendorId: string;
  productId: string;
  deviceAddress: number;
  isProcyon: boolean;
}

export interface OneSecondRecord {
  timestamp: string;
  temperature: number;
  batteryVoltage: number;
  rpmMinX: number;
  rpmMaxX: number;
  rpmAvgX: number;
  rpmRmsX: number;
  rpmMinY: number;
  rpmMaxY: number;
  rpmAvgY: number;
  rpmRmsY: number;
  rpmMinZ: number;
  rpmMaxZ: number;
  rpmAvgZ: number;
  rpmRmsZ: number;
  shockLowMinX: number;
  shockLowMaxX: number;
  shockLowAvgX: number;
  shockLowRmsX: number;
  shockLowMinY: number;
  shockLowMaxY: number;
  shockLowAvgY: number;
  shockLowRmsY: number;
  shockLowMinZ: number;
  shockLowMaxZ: number;
  shockLowAvgZ: number;
  shockLowRmsZ: number;
  shockMinX: number;
  shockMaxX: number;
  shockAvgX: number;
  shockRmsX: number;
  shockMinY: number;
  shockMaxY: number;
  shockAvgY: number;
  shockRmsY: number;
  shockMinZ: number;
  shockMaxZ: number;
  shockAvgZ: number;
  shockRmsZ: number;
  shockLateralMax: number;
  shockLateralRms: number;
  pressure: number;
}

export interface SelfTestResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
  value?: number | string;
  unit?: string;
}

export interface SelfTestSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: string;
}

export interface DownloadProgress {
  partition: number;
  totalPartitions: number;
  chunk: number;
  totalChunks: number;
  percent: number;
}

export interface InitProgress {
  step: string;
  status: string;
}

export interface SelfTestProgress {
  current: number;
  total: number;
  testId: string;
  testName: string;
  status: string;
}

export interface DownloadResult {
  success: boolean;
  partitions: Array<{
    partition: number;
    data: number[];
    size: number;
  }>;
  totalPartitions: number;
  error?: string;
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
 * Check if running in Electron
 */
export function isElectron(): boolean {
  return getAPI() !== null;
}

/**
 * List USB devices that match Procyon VID/PID
 */
export async function listDevices(): Promise<UsbDeviceInfo[]> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.listDevices() as Promise<UsbDeviceInfo[]>;
}

/**
 * Diagnose USB - list ALL connected devices for debugging
 */
export async function diagnoseUsb(): Promise<Record<string, unknown>> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.diagnose() as Promise<Record<string, unknown>>;
}

/**
 * Connect to device via USB
 */
export async function connectToDevice(): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.connect() as Promise<{ success: boolean; error?: string }>;
}

/**
 * Disconnect from device
 */
export async function disconnectDevice(): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.disconnect() as Promise<{ success: boolean; error?: string }>;
}

/**
 * Get device information
 */
export async function getDeviceInfo(): Promise<{ success: boolean; info?: DeviceInfo; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.getDeviceInfo() as Promise<{ success: boolean; info?: DeviceInfo; error?: string }>;
}

/**
 * Set tool serial number
 */
export async function setToolSN(sn: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setToolSN(sn) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set run ID
 */
export async function setRunID(runId: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setRunID(runId) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set customer
 */
export async function setCustomer(customer: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setCustomer(customer) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set district
 */
export async function setDistrict(district: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setDistrict(district) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set country
 */
export async function setCountry(country: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setCountry(country) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set depth out
 */
export async function setDepthOut(depth: number): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setDepthOut(depth) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Write all SET parameters into flash memory
 * Must be called after all SET commands succeed
 */
export async function writeIntoFlash(): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.writeIntoFlash() as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set multiple init parameters at once with 50ms delays between each
 * Then write into flash
 */
export async function setInitParameters(params: {
  customer?: string;
  country?: string;
  district?: string;
  ldap?: string;
  toolType?: string;
  toolPosition?: string;
  toolSN?: string;
  toolSize?: string;
  uhConnectionType?: string;
  dhConnectionType?: string;
  intPressureSN?: string;
  extPressureSN?: string;
  limpetSN?: string;
  configName?: string;
  uniqueId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setInitParameters(params) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set LDAP
 */
export async function setLDAP(ldap: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setLDAP(ldap) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set tool type
 */
export async function setToolType(toolType: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setToolType(toolType) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set tool position
 */
export async function setToolPosition(position: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setToolPosition(position) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set tool size
 */
export async function setToolSize(size: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setToolSize(size) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set config name
 */
export async function setConfigName(name: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setConfigName(name) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set unique ID
 */
export async function setUniqueID(id: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setUniqueID(id) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set run ID type
 */
export async function setRunIDType(runIdType: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setRunIDType(runIdType) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set UH connection type
 */
export async function setUHConnectionType(connType: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setUHConnectionType(connType) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set DH connection type
 */
export async function setDHConnectionType(connType: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setDHConnectionType(connType) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set internal pressure sensor serial number
 */
export async function setIntPressureSN(sn: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setIntPressureSN(sn) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set external pressure sensor serial number
 */
export async function setExtPressureSN(sn: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setExtPressureSN(sn) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set limpet sensor serial number
 */
export async function setLimpetSN(sn: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setLimpetSN(sn) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set tool axial position (Polaris only)
 */
export async function setToolAxialPosition(axial: string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.setToolAxialPosition(axial) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Set device time
 * @param date - Date object or ISO string. If not provided, uses current time.
 */
export async function setDeviceTime(date?: Date | string): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  const dateStr = date ? (date instanceof Date ? date.toISOString() : String(date)) : new Date().toISOString();
  return api.setDeviceTime(dateStr) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Erase used memory
 */
export async function eraseUsedMemory(): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.eraseUsedMemory() as Promise<{ success: boolean; error?: string }>;
}

/**
 * Erase all memory
 */
export async function eraseAllMemory(): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.eraseAllMemory() as Promise<{ success: boolean; error?: string }>;
}

/**
 * Get number of memory partitions
 */
export async function getMemoryPartitions(): Promise<{ success: boolean; count: number; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.getMemoryPartitions() as Promise<{ success: boolean; count: number; error?: string }>;
}

/**
 * Download data from device memory (raw partition dump)
 */
export async function downloadData(): Promise<DownloadResult> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.downloadData({}) as Promise<DownloadResult>;
}

/**
 * Register a callback for download progress events
 */
export function onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void {
  const api = getAPI();
  if (!api || !api.onDownloadProgress) return () => {};
  return api.onDownloadProgress(callback) as unknown as () => void;
}

/**
 * Run self test
 */
export async function runSelfTest(tests?: string[]): Promise<{
  success: boolean;
  results?: SelfTestResult[];
  summary?: SelfTestSummary;
  error?: string;
}> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.runSelfTest(tests || []) as Promise<{
    success: boolean;
    results?: SelfTestResult[];
    summary?: SelfTestSummary;
    error?: string;
  }>;
}

/**
 * Register a callback for self-test progress events
 */
export function onSelfTestProgress(callback: (progress: SelfTestProgress) => void): () => void {
  const api = getAPI();
  if (!api || !api.onSelfTestProgress) return () => {};
  return api.onSelfTestProgress(callback) as unknown as () => void;
}

/**
 * Get battery voltage
 */
export async function getBatteryVoltage(): Promise<{ success: boolean; voltage: number; rawMv?: number; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.getBatteryVoltage() as Promise<{ success: boolean; voltage: number; rawMv?: number; error?: string }>;
}

/**
 * Get temperature
 */
export async function getTemperature(): Promise<{ success: boolean; temperature: number; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.getTemperature() as Promise<{ success: boolean; temperature: number; error?: string }>;
}

/**
 * Initialize logger with parameters
 */
export async function initializeLogger(params: {
  customer?: string;
  country?: string;
  district?: string;
  runIdType?: string;
  runId?: string;
  deptOut?: string;
  ldap?: string;
  toolType?: string;
  toolPosition?: string;
  toolSize?: string;
  toolSN?: string;
  configName?: string;
  uniqueId?: string;
  housingNumber?: string;
  bhaSerialNumber?: string;
  axialPosition?: string;
  sensorHeadSN?: string;
  uhConnectionType?: string;
  dhConnectionType?: string;
  intPressureSN?: string;
  extPressureSN?: string;
  limpetSN?: string;
}, eraseMemory?: boolean): Promise<{
  success: boolean;
  steps?: Array<{ name: string; success: boolean; detail?: string }>;
  error?: string;
}> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.initializeLogger(params, !!eraseMemory) as Promise<{
    success: boolean;
    steps?: Array<{ name: string; success: boolean; detail?: string }>;
    error?: string;
  }>;
}

/**
 * Register a callback for initialization progress events
 */
export function onInitProgress(callback: (progress: InitProgress) => void): () => void {
  const api = getAPI();
  if (!api || !api.onInitProgress) return () => {};
  return api.onInitProgress(callback) as unknown as () => void;
}

/**
 * Launch device (delayed start)
 */
export async function launchDevice(delaySeconds?: number): Promise<{ success: boolean; detail?: string; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.launchDevice(delaySeconds) as Promise<{ success: boolean; detail?: string; error?: string }>;
}

/**
 * Erase memory with progress tracking
 */
export async function eraseMemory(eraseAll: boolean): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.eraseMemory(eraseAll) as Promise<{ success: boolean; error?: string }>;
}

/**
 * Check if device is connected (in Electron main process)
 */
export async function isDeviceConnected(): Promise<boolean> {
  const api = getAPI();
  if (!api) {
    return false;
  }
  return api.isConnected() as Promise<boolean>;
}

/**
 * Get all parameters from device at once
 */
export async function getAllParameters(): Promise<{ success: boolean; params?: Record<string, string>; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.getAllParameters() as Promise<{ success: boolean; params?: Record<string, string>; error?: string }>;
}

/**
 * Get real-time sensor data from device
 */
export async function getSensorData(): Promise<Record<string, string>> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.getSensorData() as Promise<Record<string, string>>;
}

/**
 * Export data to CSV format
 */
export function exportToCSV(data: OneSecondRecord[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = [
    'Timestamp', 'Temperature(C)', 'BatteryV(mV)',
    'RpmMinX', 'RpmMaxX', 'RpmAvgX', 'RpmRmsX',
    'RpmMinY', 'RpmMaxY', 'RpmAvgY', 'RpmRmsY',
    'RpmMinZ', 'RpmMaxZ', 'RpmAvgZ', 'RpmRmsZ',
    'ShockLowMinX(g)', 'ShockLowMaxX(g)', 'ShockLowAvgX(g)', 'ShockLowRmsX(g)',
    'ShockLowMinY(g)', 'ShockLowMaxY(g)', 'ShockLowAvgY(g)', 'ShockLowRmsY(g)',
    'ShockLowMinZ(g)', 'ShockLowMaxZ(g)', 'ShockLowAvgZ(g)', 'ShockLowRmsZ(g)',
    'ShockMinX(g)', 'ShockMaxX(g)', 'ShockAvgX(g)', 'ShockRmsX(g)',
    'ShockMinY(g)', 'ShockMaxY(g)', 'ShockAvgY(g)', 'ShockRmsY(g)',
    'ShockMinZ(g)', 'ShockMaxZ(g)', 'ShockAvgZ(g)', 'ShockRmsZ(g)',
    'ShockLateralMax(g)', 'ShockLateralRms(g)',
    'Pressure(psi)',
  ];

  const rows = data.map((r) => [
    r.timestamp,
    r.temperature.toFixed(2),
    r.batteryVoltage.toFixed(0),
    r.rpmMinX.toFixed(2), r.rpmMaxX.toFixed(2), r.rpmAvgX.toFixed(2), r.rpmRmsX.toFixed(2),
    r.rpmMinY.toFixed(2), r.rpmMaxY.toFixed(2), r.rpmAvgY.toFixed(2), r.rpmRmsY.toFixed(2),
    r.rpmMinZ.toFixed(2), r.rpmMaxZ.toFixed(2), r.rpmAvgZ.toFixed(2), r.rpmRmsZ.toFixed(2),
    r.shockLowMinX.toFixed(4), r.shockLowMaxX.toFixed(4), r.shockLowAvgX.toFixed(4), r.shockLowRmsX.toFixed(4),
    r.shockLowMinY.toFixed(4), r.shockLowMaxY.toFixed(4), r.shockLowAvgY.toFixed(4), r.shockLowRmsY.toFixed(4),
    r.shockLowMinZ.toFixed(4), r.shockLowMaxZ.toFixed(4), r.shockLowAvgZ.toFixed(4), r.shockLowRmsZ.toFixed(4),
    r.shockMinX.toFixed(3), r.shockMaxX.toFixed(3), r.shockAvgX.toFixed(3), r.shockRmsX.toFixed(3),
    r.shockMinY.toFixed(3), r.shockMaxY.toFixed(3), r.shockAvgY.toFixed(3), r.shockRmsY.toFixed(3),
    r.shockMinZ.toFixed(3), r.shockMaxZ.toFixed(3), r.shockAvgZ.toFixed(3), r.shockRmsZ.toFixed(3),
    r.shockLateralMax.toFixed(3), r.shockLateralRms.toFixed(3),
    r.pressure.toFixed(2),
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

// USB Configuration constants
export const USB_CONFIG = {
  VENDOR_ID: 0x2269,
  PRODUCT_ID: 0xBEEF,
};
