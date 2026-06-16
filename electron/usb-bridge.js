const { execFile } = require('child_process');
const path = require('path');

const PROCYON_VID = 0x2269;
const PROCYON_PID = 0xBEEF;

// USB Endpoints
const EP_OUT = 0x01;
const EP_IN = 0x81;

// Command definitions (Procyon CM protocol)
const CMD = {
  GET_FIRMWARE_VERSION:     0x01,
  GET_BATTERY_VOLTAGE:      0x02,
  GET_TEMPERATURE:          0x03,
  GET_TOOL_SN:              0x04,
  SET_TOOL_SN:              0x05,
  GET_RUN_ID:               0x06,
  SET_RUN_ID:               0x07,
  GET_CUSTOMER:             0x08,
  SET_CUSTOMER:             0x09,
  GET_DISTRICT:             0x0A,
  SET_DISTRICT:             0x0B,
  GET_COUNTRY:              0x0C,
  SET_COUNTRY:              0x0D,
  GET_DEPTH_OUT:            0x0E,
  SET_DEPTH_OUT:            0x0F,
  GET_UNIQUE_ID:            0x10,
  GET_MEMORY_PARTITIONS:    0x11,
  GET_MEMORY_DUMP_CHUNK:    0x12,
  ERASE_MEMORY:             0x13,
  GET_MEMORY_ERASE_PERCENT: 0x14,
  RUN_SELF_TEST:            0x15,
  INITIALIZE_LOGGER:        0x16,
};

const RESPONSE_HEADER = 0xA5;
const DATA_HEADER = 0xA0;
const PACKET_SIZE = 64;

/**
 * Procyon USB Bridge - WinUSB Direct (bypasses libusb/node-usb)
 *
 * This version uses procyon-usb.exe (compiled C#) which calls
 * WinUSB API directly via P/Invoke, avoiding all libusb issues
 * on Windows (LIBUSB_ERROR_NOT_FOUND etc.)
 */
class ProcyonUsbBridge {
  constructor() {
    this.connected = false;
    this.exePath = path.join(__dirname, 'procyon-usb.exe');
    this.dataCallback = null;
  }

  /**
   * Execute procyon-usb.exe command and return parsed JSON result
   */
  _exec(args, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const proc = execFile(this.exePath, args, {
        timeout,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        if (error) {
          // Try to parse error output as JSON
          const output = (stdout || '').trim();
          if (output.startsWith('{')) {
            try {
              resolve(JSON.parse(output));
              return;
            } catch (e) {
              // Fall through to reject
            }
          }
          reject(new Error(error.message + (stderr ? ' | ' + stderr.trim() : '')));
          return;
        }

        const output = (stdout || '').trim();
        if (!output) {
          reject(new Error('No output from procyon-usb.exe'));
          return;
        }

        try {
          resolve(JSON.parse(output));
        } catch (e) {
          // Non-JSON output (e.g. test command), wrap it
          resolve({ raw: output });
        }
      });
    });
  }

  /**
   * List all USB devices (uses node-usb for listing only, no I/O)
   */
  listDevices() {
    try {
      const usb = require('usb');
      const devices = usb.getDeviceList();
      return devices.map(d => {
        const desc = d.deviceDescriptor;
        const vid = desc ? desc.idVendor : 0;
        const pid = desc ? desc.idProduct : 0;
        return {
          vendorId: `0x${vid.toString(16).padStart(4, '0')}`,
          productId: `0x${pid.toString(16).padStart(4, '0')}`,
          deviceAddress: d.deviceAddress,
          isProcyon: vid === PROCYON_VID && pid === PROCYON_PID,
        };
      });
    } catch (error) {
      console.error('[USB] Failed to list devices:', error);
      return [];
    }
  }

  /**
   * Connect to Procyon device via WinUSB
   */
  async connect() {
    try {
      if (this.connected) {
        await this.disconnect();
      }

      // First check if device can be found
      const findResult = await this._exec(['find'], 3000);
      if (!findResult.found) {
        return {
          success: false,
          error: 'Procyon WinUSB device not found. Please install WinUSB driver via Zadig:\n1. Open Zadig\n2. Select "Procyon-CM" from dropdown\n3. Set driver to WinUSB\n4. Click Replace Driver',
        };
      }

      console.log('[USB] Found Procyon WinUSB device:', findResult.path);

      // Connect via WinUSB
      const connectResult = await this._exec(['connect'], 3000);
      if (connectResult.connected) {
        this.connected = true;
        console.log('[USB] Connected via WinUSB, pipes:', connectResult.pipeIn, connectResult.pipeOut);
        return { success: true };
      } else {
        return {
          success: false,
          error: connectResult.error || 'WinUSB connection failed',
        };
      }
    } catch (error) {
      console.error('[USB] Connect error:', error);
      return { success: false, error: `Connection error: ${error.message}` };
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect() {
    try {
      if (this.connected) {
        await this._exec(['disconnect'], 2000).catch(() => {});
      }
      this.connected = false;
      console.log('[USB] Disconnected');
      return { success: true };
    } catch (error) {
      this.connected = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a command and wait for response
   */
  async _sendCommandAndWait(commandByte, data = [], timeout = 3000) {
    if (!this.connected) {
      throw new Error('Device not connected');
    }

    // Build command packet (64 bytes, padded with 0xFF)
    const packet = Buffer.alloc(PACKET_SIZE, 0xFF);
    packet[0] = commandByte;
    for (let i = 0; i < data.length && i + 1 < PACKET_SIZE; i++) {
      packet[i + 1] = data[i];
    }

    const hexData = packet.toString('hex');
    console.log('[USB] Sending command 0x' + commandByte.toString(16), hexData);

    const result = await this._exec(['sendread', hexData, String(timeout)], timeout + 2000);

    if (result.error) {
      throw new Error(result.error);
    }

    if (result.readError) {
      throw new Error('No response from device (read failed, WinError=' + (result.winError || 0) + ')');
    }

    // Parse hex data back to byte array
    const responseBytes = this._hexToBytes(result.data || '');
    console.log('[USB] Got response:', result.data);

    return responseBytes;
  }

  /**
   * Send a command without waiting for response
   */
  async _sendCommand(commandByte, data = []) {
    if (!this.connected) {
      throw new Error('Device not connected');
    }

    const packet = Buffer.alloc(PACKET_SIZE, 0xFF);
    packet[0] = commandByte;
    for (let i = 0; i < data.length && i + 1 < PACKET_SIZE; i++) {
      packet[i + 1] = data[i];
    }

    const hexData = packet.toString('hex');
    const result = await this._exec(['send', hexData], 3000);

    if (result.error) {
      throw new Error(result.error);
    }

    return { success: result.sent > 0 };
  }

  /**
   * Parse hex string to byte array
   */
  _hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
  }

  /**
   * Parse string from response bytes (null-terminated, padded with 0xFF)
   */
  _parseString(bytes, start, length) {
    let str = '';
    for (let i = start; i < start + length && i < bytes.length; i++) {
      if (bytes[i] === 0x00 || bytes[i] === 0xFF) break;
      str += String.fromCharCode(bytes[i]);
    }
    return str.trim();
  }

  /**
   * Parse signed 16-bit value from response bytes
   */
  _parseS16(bytes, offset) {
    if (!bytes || offset + 1 >= bytes.length) return 0;
    const val = bytes[offset] | (bytes[offset + 1] << 8);
    return val > 32767 ? val - 65536 : val;
  }

  /**
   * Parse unsigned 16-bit value from response bytes
   */
  _parseU16(bytes, offset) {
    if (!bytes || offset + 1 >= bytes.length) return 0;
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  /**
   * Encode string to bytes (fixed length, padded with 0xFF)
   */
  _encodeString(str, length) {
    const bytes = [];
    for (let i = 0; i < length; i++) {
      bytes.push(i < str.length ? str.charCodeAt(i) : 0xFF);
    }
    return bytes;
  }

  /**
   * Get device information (firmware version, SN, battery, temperature)
   */
  async getDeviceInfo() {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }

      const info = {};

      // Get firmware version
      try {
        const fwResp = await this._sendCommandAndWait(CMD.GET_FIRMWARE_VERSION);
        info.firmwareVersion = this._parseString(fwResp, 1, 30);
      } catch (e) {
        console.log('[USB] Get firmware version failed:', e.message);
        info.firmwareVersion = 'N/A';
      }

      // Get Tool SN
      try {
        const snResp = await this._sendCommandAndWait(CMD.GET_TOOL_SN);
        info.toolSN = this._parseString(snResp, 1, 15);
      } catch (e) {
        console.log('[USB] Get Tool SN failed:', e.message);
        info.toolSN = '';
      }

      // Get Unique ID
      try {
        const uidResp = await this._sendCommandAndWait(CMD.GET_UNIQUE_ID);
        info.uniqueId = this._parseString(uidResp, 1, 30);
      } catch (e) {
        console.log('[USB] Get Unique ID failed:', e.message);
        info.uniqueId = '';
      }

      // Get battery voltage (in millivolts, convert to volts)
      try {
        const battResp = await this._sendCommandAndWait(CMD.GET_BATTERY_VOLTAGE);
        const rawBatt = this._parseU16(battResp, 1);
        info.batteryVoltage = rawBatt / 1000.0;
      } catch (e) {
        console.log('[USB] Get battery voltage failed:', e.message);
        info.batteryVoltage = 0;
      }

      // Get temperature (in 0.1°C)
      try {
        const tempResp = await this._sendCommandAndWait(CMD.GET_TEMPERATURE);
        const rawTemp = this._parseS16(tempResp, 1);
        info.temperature = rawTemp / 10.0;
      } catch (e) {
        console.log('[USB] Get temperature failed:', e.message);
        info.temperature = undefined;
      }

      return { success: true, info };
    } catch (error) {
      console.error('[USB] getDeviceInfo error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set tool serial number
   */
  async setToolSN(sn) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const data = this._encodeString(sn, 15);
      await this._sendCommandAndWait(CMD.SET_TOOL_SN, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setToolSN error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set run ID
   */
  async setRunID(runId) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const data = this._encodeString(runId, 15);
      await this._sendCommandAndWait(CMD.SET_RUN_ID, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setRunID error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set customer
   */
  async setCustomer(customer) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const data = this._encodeString(customer, 30);
      await this._sendCommandAndWait(CMD.SET_CUSTOMER, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setCustomer error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set district
   */
  async setDistrict(district) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const data = this._encodeString(district, 30);
      await this._sendCommandAndWait(CMD.SET_DISTRICT, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setDistrict error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set country
   */
  async setCountry(country) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const data = this._encodeString(country, 30);
      await this._sendCommandAndWait(CMD.SET_COUNTRY, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setCountry error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set depth out
   */
  async setDepthOut(depth) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const buf = Buffer.alloc(4);
      buf.writeFloatLE(depth);
      const data = Array.from(buf);
      await this._sendCommandAndWait(CMD.SET_DEPTH_OUT, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setDepthOut error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get battery voltage
   */
  async getBatteryVoltage() {
    try {
      if (!this.connected) {
        return { success: false, voltage: 0, error: 'Device not connected' };
      }
      const resp = await this._sendCommandAndWait(CMD.GET_BATTERY_VOLTAGE);
      const rawBatt = this._parseU16(resp, 1);
      return { success: true, voltage: rawBatt / 1000.0 };
    } catch (error) {
      return { success: false, voltage: 0, error: error.message };
    }
  }

  /**
   * Get temperature
   */
  async getTemperature() {
    try {
      if (!this.connected) {
        return { success: false, temperature: 0, error: 'Device not connected' };
      }
      const resp = await this._sendCommandAndWait(CMD.GET_TEMPERATURE);
      const rawTemp = this._parseS16(resp, 1);
      return { success: true, temperature: rawTemp / 10.0 };
    } catch (error) {
      return { success: false, temperature: 0, error: error.message };
    }
  }

  /**
   * Get number of memory partitions
   */
  async getMemoryPartitions() {
    try {
      if (!this.connected) {
        return { success: false, count: 0, error: 'Device not connected' };
      }
      const resp = await this._sendCommandAndWait(CMD.GET_MEMORY_PARTITIONS);
      const count = resp[1] || 0;
      return { success: true, count };
    } catch (error) {
      return { success: false, count: 0, error: error.message };
    }
  }

  /**
   * Get memory erase percent
   */
  async getMemoryErasePercent() {
    try {
      if (!this.connected) {
        return { success: false, percent: 0, error: 'Device not connected' };
      }
      const resp = await this._sendCommandAndWait(CMD.GET_MEMORY_ERASE_PERCENT);
      const percent = resp[1] || 0;
      return { success: true, percent };
    } catch (error) {
      return { success: false, percent: 0, error: error.message };
    }
  }

  /**
   * Download one-second data from device memory
   */
  async downloadOneSecondData(options = {}) {
    try {
      if (!this.connected) {
        return { success: false, data: [], totalRecords: 0, error: 'Device not connected' };
      }

      const partResult = await this.getMemoryPartitions();
      if (!partResult.success) {
        return { success: false, data: [], totalRecords: 0, error: partResult.error };
      }

      const partitionCount = options.maxPartitions || partResult.count;
      const records = [];
      const CHUNK_SIZE = 32;

      console.log('[USB] Starting download, partitions:', partitionCount);

      const totalChunks = Math.ceil(partitionCount * 3600 / CHUNK_SIZE);

      for (let chunk = 0; chunk < totalChunks; chunk++) {
        const chunkData = [
          chunk & 0xFF,
          (chunk >> 8) & 0xFF,
          (chunk >> 16) & 0xFF,
          (chunk >> 24) & 0xFF,
        ];

        try {
          // Send chunk request and read response
          const resp = await this._sendCommandAndWait(
            CMD.GET_MEMORY_DUMP_CHUNK,
            chunkData,
            5000
          );

          // Parse response as data record
          if (resp && resp.length >= 60 && resp[0] === DATA_HEADER) {
            const parsed = this._parseOneSecondRecord(resp);
            if (parsed) {
              records.push(parsed);
            }
          }
        } catch (e) {
          console.log('[USB] Chunk', chunk, 'failed:', e.message);
          break;
        }
      }

      return { success: true, data: records, totalRecords: records.length };
    } catch (error) {
      console.error('[USB] downloadOneSecondData error:', error);
      return { success: false, data: [], totalRecords: 0, error: error.message };
    }
  }

  /**
   * Parse one-second data record (0xA0 header, 64 bytes)
   */
  _parseOneSecondRecord(bytes) {
    try {
      if (!bytes || bytes.length < 60 || bytes[0] !== DATA_HEADER) {
        return null;
      }

      const temp = this._parseS16(bytes, 2) / 10.0;
      const batt = this._parseU16(bytes, 4) / 1000.0;
      const seq = this._parseU16(bytes, 58);

      return {
        timestamp: new Date().toISOString(),
        temperature: temp,
        batteryVoltage: batt,
        rpmMinX: this._parseS16(bytes, 6),
        rpmMaxX: this._parseS16(bytes, 8),
        rpmAvgX: this._parseS16(bytes, 10),
        rpmRmsX: this._parseS16(bytes, 12),
        rpmMinY: this._parseS16(bytes, 14),
        rpmMaxY: this._parseS16(bytes, 16),
        rpmAvgY: this._parseS16(bytes, 18),
        rpmRmsY: this._parseS16(bytes, 20),
        rpmMinZ: this._parseS16(bytes, 22),
        rpmMaxZ: this._parseS16(bytes, 24),
        rpmAvgZ: this._parseS16(bytes, 26),
        rpmRmsZ: this._parseS16(bytes, 28),
        shockLowMinX: this._parseS16(bytes, 30),
        shockLowMaxX: this._parseS16(bytes, 32),
        shockLowAvgX: this._parseS16(bytes, 34),
        shockLowRmsX: this._parseS16(bytes, 36),
        shockLowMinY: this._parseS16(bytes, 38),
        shockLowMaxY: this._parseS16(bytes, 40),
        shockLowAvgY: this._parseS16(bytes, 42),
        shockLowRmsY: this._parseS16(bytes, 44),
        shockLowMinZ: this._parseS16(bytes, 46),
        shockLowMaxZ: this._parseS16(bytes, 48),
        shockLowAvgZ: this._parseS16(bytes, 50),
        shockLowRmsZ: this._parseS16(bytes, 52),
        shockMinX: this._parseS16(bytes, 54),
        shockMaxX: this._parseS16(bytes, 56),
        sequence: seq,
      };
    } catch (e) {
      console.error('[USB] Parse one-second record error:', e);
      return null;
    }
  }

  /**
   * Run self test
   */
  async runSelfTest() {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }

      const resp = await this._sendCommandAndWait(CMD.RUN_SELF_TEST, [], 15000);

      const testNames = [
        'Firmware Test',
        'Memory Test',
        'Sensor Test',
        'Communication Test',
        'Battery Test',
        'Temperature Test',
      ];

      const results = [];
      for (let i = 0; i < testNames.length; i++) {
        const statusByte = i < resp.length - 1 ? resp[i + 1] : 0;
        let status;
        if (statusByte === 0x01) status = 'pass';
        else if (statusByte === 0x02) status = 'fail';
        else if (statusByte === 0x03) status = 'warning';
        else status = 'skip';

        results.push({ name: testNames[i], status, duration: 0 });
      }

      return { success: true, results };
    } catch (error) {
      console.error('[USB] runSelfTest error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Initialize logger
   */
  async initializeLogger(config) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }

      const data = [];
      data.push(...this._encodeString(config.toolSN || '', 15));
      data.push(...this._encodeString(config.runId || '', 15));
      data.push(...this._encodeString(config.customer || '', 30));
      data.push(...this._encodeString(config.district || '', 30));

      await this._sendCommandAndWait(CMD.INITIALIZE_LOGGER, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] initializeLogger error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Diagnose USB connection
   */
  async diagnose() {
    try {
      const result = {
        success: true,
        backend: 'winusb-direct',
        totalDevices: 0,
        devices: [],
        procyonDetail: null,
        winusbTest: null,
      };

      // List devices via node-usb (just for enumeration, no I/O)
      try {
        const usb = require('usb');
        const devices = usb.getDeviceList();
        result.totalDevices = devices.length;
        result.devices = devices.map(d => {
          const desc = d.deviceDescriptor;
          const vid = desc ? desc.idVendor : 0;
          const pid = desc ? desc.idProduct : 0;
          return {
            vid: `0x${vid.toString(16).padStart(4, '0')}`,
            pid: `0x${pid.toString(16).padStart(4, '0')}`,
            address: d.deviceAddress,
            isProcyon: vid === PROCYON_VID && pid === PROCYON_PID,
          };
        });

        const procyonDevice = devices.find(d => {
          const desc = d.deviceDescriptor;
          return desc && desc.idVendor === PROCYON_VID && desc.idProduct === PROCYON_PID;
        });

        if (procyonDevice) {
          result.procyonDetail = {
            found: true,
            vid: `0x${PROCYON_VID.toString(16)}`,
            pid: `0x${PROCYON_PID.toString(16)}`,
            address: procyonDevice.deviceAddress,
          };
        } else {
          result.procyonDetail = { found: false };
        }
      } catch (usbErr) {
        result.usbListError = usbErr.message;
      }

      // Test WinUSB direct connection
      try {
        const findResult = await this._exec(['find'], 3000);
        result.winusbTest = {
          exeFound: true,
          deviceFound: findResult.found || false,
          devicePath: findResult.path || null,
          findError: findResult.error || null,
        };
      } catch (exeErr) {
        result.winusbTest = {
          exeFound: false,
          error: exeErr.message,
        };
      }

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }
}

const bridge = new ProcyonUsbBridge();
module.exports = { bridge, PROCYON_VID, PROCYON_PID };
