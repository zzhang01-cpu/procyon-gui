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
}

export interface SelfTestResult {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'skip';
  duration: number;
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
 * Download one second data
 */
export async function downloadOneSecondData(options?: {
  maxPartitions?: number;
}): Promise<{ success: boolean; data: OneSecondRecord[]; totalRecords: number; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.downloadData(options || {}) as Promise<{ success: boolean; data: OneSecondRecord[]; totalRecords: number; error?: string }>;
}

/**
 * Run self test
 */
export async function runSelfTest(): Promise<{ success: boolean; results?: SelfTestResult[]; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.runSelfTest() as Promise<{ success: boolean; results?: SelfTestResult[]; error?: string }>;
}

/**
 * Get battery voltage
 */
export async function getBatteryVoltage(): Promise<{ success: boolean; voltage: number; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.getBatteryVoltage() as Promise<{ success: boolean; voltage: number; error?: string }>;
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
 * Initialize logger
 */
export async function initializeLogger(config: {
  toolSN?: string;
  runId?: string;
  customer?: string;
  district?: string;
}): Promise<{ success: boolean; error?: string }> {
  const api = getAPI();
  if (!api) {
    throw new Error('Not running in Electron environment');
  }
  return api.initializeLogger(config) as Promise<{ success: boolean; error?: string }>;
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
 * Export data to CSV format
 */
export function exportToCSV(data: OneSecondRecord[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = [
    'Timestamp', 'Temperature(C)', 'BatteryV(V)',
    'RpmMinX', 'RpmMaxX', 'RpmAvgX', 'RpmRmsX',
    'RpmMinY', 'RpmMaxY', 'RpmAvgY', 'RpmRmsY',
    'RpmMinZ', 'RpmMaxZ', 'RpmAvgZ', 'RpmRmsZ',
    'ShockLowMinX(g)', 'ShockLowMaxX(g)', 'ShockLowAvgX(g)', 'ShockLowRmsX(g)',
    'ShockLowMinY(g)', 'ShockLowMaxY(g)', 'ShockLowAvgY(g)', 'ShockLowRmsY(g)',
    'ShockLowMinZ(g)', 'ShockLowMaxZ(g)', 'ShockLowAvgZ(g)', 'ShockLowRmsZ(g)',
    'ShockMinX(g)', 'ShockMaxX(g)',
  ];

  const rows = data.map((r) => [
    r.timestamp,
    r.temperature.toFixed(2),
    r.batteryVoltage.toFixed(3),
    r.rpmMinX.toFixed(2), r.rpmMaxX.toFixed(2), r.rpmAvgX.toFixed(2), r.rpmRmsX.toFixed(2),
    r.rpmMinY.toFixed(2), r.rpmMaxY.toFixed(2), r.rpmAvgY.toFixed(2), r.rpmRmsY.toFixed(2),
    r.rpmMinZ.toFixed(2), r.rpmMaxZ.toFixed(2), r.rpmAvgZ.toFixed(2), r.rpmRmsZ.toFixed(2),
    r.shockLowMinX.toFixed(4), r.shockLowMaxX.toFixed(4), r.shockLowAvgX.toFixed(4), r.shockLowRmsX.toFixed(4),
    r.shockLowMinY.toFixed(4), r.shockLowMaxY.toFixed(4), r.shockLowAvgY.toFixed(4), r.shockLowRmsY.toFixed(4),
    r.shockLowMinZ.toFixed(4), r.shockLowMaxZ.toFixed(4), r.shockLowAvgZ.toFixed(4), r.shockLowRmsZ.toFixed(4),
    r.shockMinX.toFixed(3), r.shockMaxX.toFixed(3),
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

// USB Configuration constants
export const USB_CONFIG = {
  VENDOR_ID: 0x2269,
  PRODUCT_ID: 0xBEEF,
};
