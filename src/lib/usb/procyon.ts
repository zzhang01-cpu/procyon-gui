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
    chunksRead?: number;
    writtenChunks?: number;
    totalChunks?: number;
    writtenBytes?: number;
  }>;
  totalPartitions: number;
  error?: string;
  partitionDebug?: string[];
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

  // Match original Procyon software CSV column names
  const headers = [
    'Timestamp', 'Temperature', 'BatteryV',
    'rpmX_min', 'rpmX_max', 'rpmX_avg', 'rpmX_rms',
    'rpmY_min', 'rpmY_max', 'rpmY_avg', 'rpmY_rms',
    'rpmZ_min', 'rpmZ_max', 'rpmZ_avg', 'rpmZ_rms',
    'lowShockX_min', 'lowShockX_max', 'lowShockX_avg', 'lowShockX_rms',
    'lowShockY_min', 'lowShockY_max', 'lowShockY_avg', 'lowShockY_rms',
    'lowShockZ_min', 'lowShockZ_max', 'lowShockZ_avg', 'lowShockZ_rms',
    'highShockX_min', 'highShockX_max', 'highShockX_avg', 'highShockX_rms',
    'highShockY_min', 'highShockY_max', 'highShockY_avg', 'highShockY_rms',
    'highShockZ_min', 'highShockZ_max', 'highShockZ_avg', 'highShockZ_rms',
    'highShockLateral_max', 'highShockLateral_rms',
    'psi_avg',
  ];

  const rows = data.map((r) => [
    r.timestamp,
    r.temperature.toFixed(4),
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

  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  return BOM + [headers.join(','), ...rows].join('\n');
}

// USB Configuration constants
export const USB_CONFIG = {
  VENDOR_ID: 0x2269,
  PRODUCT_ID: 0xBEEF,
};

/**
 * Parse raw binary data from device download into OneSecondRecord[]
 * Binary format based on RecordFormatFiles.json - OneSecondData (0xA0)
 */
export function parseBinaryRecords(partitions: { partition: number; data: Buffer | number[]; size: number }[]): OneSecondRecord[] {
  const records: OneSecondRecord[] = [];

  console.log('[parseBinaryRecords] Called with', partitions.length, 'partitions');
  for (const part of partitions) {
    console.log('[parseBinaryRecords] Partition', part.partition, ': size=', part.size, 'data type=', typeof part.data, Array.isArray(part.data) ? 'array[' + (part.data as any).length + ']' : Buffer.isBuffer(part.data) ? 'buffer' : part.data && typeof part.data === 'object' && (part.data as any).type === 'Buffer' ? 'serialized-buffer[' + (part.data as any).data?.length + ']' : typeof part.data);
    // Handle IPC-serialized Buffer
    let buf: Buffer;
    if (Buffer.isBuffer(part.data)) {
      buf = part.data;
    } else if (Array.isArray(part.data)) {
      buf = Buffer.from(part.data);
    } else if (part.data && typeof part.data === 'object' && (part.data as any).type === 'Buffer' && Array.isArray((part.data as any).data)) {
      buf = Buffer.from((part.data as any).data);
    } else {
      console.log('[parseBinaryRecords] Partition', part.partition, ': unknown data type', typeof part.data, '- skipping');
      continue;
    }

    console.log('[parseBinaryRecords] Partition', part.partition, ': buffer size=', buf.length, 'first 20 bytes=', Array.from(buf.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));

    if (buf.length === 0) {
      console.log('[parseBinaryRecords] Partition', part.partition, ': empty buffer, skipping');
      continue;
    }

    let offset = 0;
    let recordTypeCounts: Record<number, number> = {};
    const firstBytes = buf.slice(0, Math.min(32, buf.length)).toString('hex');
    console.log('[parseBinaryRecords] Partition', part.partition, ': first 32 bytes hex:', firstBytes);

    while (offset + 4 <= buf.length) {
      // Check for record header: record type byte
      const recordType = buf[offset];
      recordTypeCounts[recordType] = (recordTypeCounts[recordType] || 0) + 1;

      // OneSecondData record type = 0xA0
      if (recordType === 0xA0) {
        // Need at least 84 bytes for a complete OneSecondData record
        if (offset + 84 > buf.length) break;

        // Skip record type byte and read s16 values
        // Format: [type(1)] [s16 x 42] but we need to find the actual offset
        // Actually, the record format from DLL shows the data starts directly after the record marker
        // Let's try reading starting from offset+1 (after type byte)
        const dataOffset = offset + 1;

        // Parse s16 values with scales from RecordFormatFiles.json
        const temp = buf.readInt16LE(dataOffset) * 0.03125;
        const batt = buf.readInt16LE(dataOffset + 2) * 0.001027;

        // RpmMinX/Y/Z x 4 each (Min/Max/Avg/Rms) at scale 0.02333
        const rpmMinX = buf.readInt16LE(dataOffset + 4) * 0.02333;
        const rpmMaxX = buf.readInt16LE(dataOffset + 6) * 0.02333;
        const rpmAvgX = buf.readInt16LE(dataOffset + 8) * 0.02333;
        const rpmRmsX = buf.readInt16LE(dataOffset + 10) * 0.02333;
        const rpmMinY = buf.readInt16LE(dataOffset + 12) * 0.02333;
        const rpmMaxY = buf.readInt16LE(dataOffset + 14) * 0.02333;
        const rpmAvgY = buf.readInt16LE(dataOffset + 16) * 0.02333;
        const rpmRmsY = buf.readInt16LE(dataOffset + 18) * 0.02333;
        const rpmMinZ = buf.readInt16LE(dataOffset + 20) * 0.02333;
        const rpmMaxZ = buf.readInt16LE(dataOffset + 22) * 0.02333;
        const rpmAvgZ = buf.readInt16LE(dataOffset + 24) * 0.02333;
        const rpmRmsZ = buf.readInt16LE(dataOffset + 26) * 0.02333;

        // ShockLowMinX/Y/Z x 4 each at scale 0.000244
        const shockLowMinX = buf.readInt16LE(dataOffset + 28) * 0.000244;
        const shockLowMaxX = buf.readInt16LE(dataOffset + 30) * 0.000244;
        const shockLowAvgX = buf.readInt16LE(dataOffset + 32) * 0.000244;
        const shockLowRmsX = buf.readInt16LE(dataOffset + 34) * 0.000244;
        const shockLowMinY = buf.readInt16LE(dataOffset + 36) * 0.000244;
        const shockLowMaxY = buf.readInt16LE(dataOffset + 38) * 0.000244;
        const shockLowAvgY = buf.readInt16LE(dataOffset + 40) * 0.000244;
        const shockLowRmsY = buf.readInt16LE(dataOffset + 42) * 0.000244;
        const shockLowMinZ = buf.readInt16LE(dataOffset + 44) * 0.000244;
        const shockLowMaxZ = buf.readInt16LE(dataOffset + 46) * 0.000244;
        const shockLowAvgZ = buf.readInt16LE(dataOffset + 48) * 0.000244;
        const shockLowRmsZ = buf.readInt16LE(dataOffset + 50) * 0.000244;

        // ShockMinX/Y/Z x 4 each at scale 0.2
        const shockMinX = buf.readInt16LE(dataOffset + 52) * 0.2;
        const shockMaxX = buf.readInt16LE(dataOffset + 54) * 0.2;
        const shockAvgX = buf.readInt16LE(dataOffset + 56) * 0.2;
        const shockRmsX = buf.readInt16LE(dataOffset + 58) * 0.2;
        const shockMinY = buf.readInt16LE(dataOffset + 60) * 0.2;
        const shockMaxY = buf.readInt16LE(dataOffset + 62) * 0.2;
        const shockAvgY = buf.readInt16LE(dataOffset + 64) * 0.2;
        const shockRmsY = buf.readInt16LE(dataOffset + 66) * 0.2;
        const shockMinZ = buf.readInt16LE(dataOffset + 68) * 0.2;
        const shockMaxZ = buf.readInt16LE(dataOffset + 70) * 0.2;
        const shockAvgZ = buf.readInt16LE(dataOffset + 72) * 0.2;
        const shockRmsZ = buf.readInt16LE(dataOffset + 74) * 0.2;

        // ShockLateral Max/Rms at scale 0.2
        const shockLateralMax = buf.readInt16LE(dataOffset + 76) * 0.2;
        const shockLateralRms = buf.readInt16LE(dataOffset + 78) * 0.2;

        records.push({
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          temperature: temp,
          batteryVoltage: batt,
          rpmMinX, rpmMaxX, rpmAvgX, rpmRmsX,
          rpmMinY, rpmMaxY, rpmAvgY, rpmRmsY,
          rpmMinZ, rpmMaxZ, rpmAvgZ, rpmRmsZ,
          shockLowMinX, shockLowMaxX, shockLowAvgX, shockLowRmsX,
          shockLowMinY, shockLowMaxY, shockLowAvgY, shockLowRmsY,
          shockLowMinZ, shockLowMaxZ, shockLowAvgZ, shockLowRmsZ,
          shockMinX, shockMaxX, shockAvgX, shockRmsX,
          shockMinY, shockMaxY, shockAvgY, shockRmsY,
          shockMinZ, shockMaxZ, shockAvgZ, shockRmsZ,
          shockLateralMax, shockLateralRms,
          pressure: 0,
        });

        offset += 84; // 1 type byte + 83 data bytes ≈ move forward
      } else if (recordType === 0x01) {
        // FirmwareVersion record - skip
        offset += 8;
      } else if (recordType === 0x02) {
        // Reset record - skip
        offset += 8;
      } else if (recordType === 0x0D) {
        // FlashDeviceID record - skip
        offset += 8;
      } else if (recordType === 0xFF) {
        // Flush record - skip
        offset += 4;
      } else {
        // Unknown record type - skip 1 byte and try to resync
        offset += 1;
      }
    }

    console.log('[parseBinaryRecords] Partition', part.partition, ': found', records.length, 'total records so far, scanned', buf.length, 'bytes, record types:', JSON.stringify(recordTypeCounts));
  }

  // Assign incremental timestamps (1 second apart)
  const now = new Date();
  for (let i = records.length - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - (records.length - 1 - i) * 1000);
    records[i].timestamp = t.toISOString().replace('T', ' ').substring(0, 19);
  }

  return records;
}
