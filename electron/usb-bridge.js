const { execFile } = require('child_process');
const path = require('path');

const PROCYON_VID = 0x2269;
const PROCYON_PID = 0xBEEF;

// USB Endpoints
const EP_OUT = 0x01;
const EP_IN = 0x81;

// ============================================================
// Procyon CM Protocol - Verified Command Codes
// ============================================================
// Protocol format: 4-byte header [cmd_low, cmd_high, length_low, length_high]
// Response code = request code + 1
// GET commands: 4-byte header only, device returns header + data
// SET commands: header + data (protocol TBD - pending DLL decompilation)
// ============================================================

const CMD = {
  // --- GET commands (verified via USB testing) ---
  GET_FIRMWARE_VERSION:       0x0005,  // 4B: v2.0.6.2
  GET_UNKNOWN_0A:             0x000A,  // 1B: 0x03
  CMD_MODE_SWITCH_C:          0x000C,  // 0B response (mode/unlock?)
  CMD_MODE_SWITCH_E:          0x000E,  // 0B response (mode/unlock?)
  GET_RECORD_COUNT:           0x001F,  // 4B: record count
  GET_UNKNOWN_30:             0x0030,  // 0B
  GET_UNKNOWN_32:             0x0032,  // 0B
  GET_UNKNOWN_34:             0x0034,  // 1B (varies)
  GET_BATTERY_VOLTAGE:        0x0040,  // 4B float
  GET_DEVICE_TIME:            0x0042,  // 6B: YY-MM-DD-HH-MM-SS
  GET_TEMPERATURE_CM:         0x0046,  // 4B float
  GET_SENSOR_50:              0x0050,  // 1B
  GET_SENSOR_52:              0x0052,  // 1B
  GET_SENSOR_54:              0x0054,  // 1B
  GET_SENSOR_56:              0x0056,  // 1B
  GET_PRESSURE_CM:            0x0096,  // 12B (zero=not downhole)
  GET_CUSTOMER:               0x0102,  // 0B (empty)
  GET_COUNTRY:                0x0106,  // 0B (empty)
  GET_TOOL_SN:                0x014C,  // 0B (empty)

  // --- SET commands (codes TBD - from DLL string analysis, likely at odd offsets) ---
  // The DLL reveals these SET command names but exact codes need DLL decompilation:
  // SET_CUSTOMER, SET_COUNTRY, SET_TOOL_SN, SET_DEVICE_TIME,
  // SET_RUN_ID, SET_DISTRICT, SET_DEPT_OUT, SET_UNIQUE_ID, SET_LDAP,
  // SET_CONFIG_NAME, SET_TOOL_TYPE, SET_TOOL_SIZE, SET_TOOL_POSITION,
  // SET_TOOL_AXIAL_POSITION, SET_DH_CONNECTION_TYPE, SET_UH_CONNECTION_TYPE,
  // SET_RUN_ID_TYPE, SET_HOUSING_NUMBER, SET_BHA_SERIAL_NUMBER,
  // SET_DRILL_BIT_INFO_BIT_BLADE_NUMBER, SET_DRILL_BIT_INFO_BIT_BOM,
  // SET_AMPLIFIER_DAC_OFFSET, SET_AMPLIFIER_FIRST_STAGE_GAIN,
  // SET_AMPLIFIER_SECOND_STAGE_GAIN, SET_SELF_TEST_MODE,
  // SET_PARAMETERS_INTO_FLASH
  //
  // DLL key functions: SetDeviceParameter<T>, WriteIntoFlashAsync, DelayBetweenWrites
  // SET uses a different code path than GET (not simple CommandDevice)

  // --- Memory/Data commands ---
  GET_MEMORY_DUMP_CHUNK_SIZE: 0x0035,
  MEMORY_DUMP_START:          0x0031,
  GET_MEMORY_ERASE_PERCENT:   0x0033,

  // --- Self Test ---
  SET_SELF_TEST_MODE:         0x0057,  // 1B: 0x03 (mode value)
};

const PACKET_SIZE = 64;

/**
 * Build 4-byte command header
 * Format: [cmd_low, cmd_high, length_low, length_high]
 */
function buildCommandHeader(cmdCode, dataLength = 0) {
  return [
    cmdCode & 0xFF,          // cmd_low
    (cmdCode >> 8) & 0xFF,   // cmd_high
    dataLength & 0xFF,        // length_low
    (dataLength >> 8) & 0xFF, // length_high
  ];
}

/**
 * Build a complete command packet
 * GET: 4-byte header only (pad to 64 bytes with 0xFF for USB transport)
 * SET: 4-byte header + data bytes (pad to 64 bytes)
 */
function buildCommandPacket(cmdCode, data = []) {
  const header = buildCommandHeader(cmdCode, data.length);
  const packet = Buffer.alloc(PACKET_SIZE, 0xFF);
  // Write header
  for (let i = 0; i < header.length; i++) packet[i] = header[i];
  // Write data after header
  for (let i = 0; i < data.length && i + 4 < PACKET_SIZE; i++) {
    packet[i + 4] = data[i];
  }
  return packet;
}

/**
 * Parse response from device
 * Response format: [resp_low, resp_high, length_low, length_high, ...data]
 * Response code = request code + 1
 */
function parseResponse(respBytes, expectedCmdCode) {
  if (!respBytes || respBytes.length < 4) {
    return { success: false, error: 'Response too short' };
  }

  const respCode = respBytes[0] | (respBytes[1] << 8);
  const dataLength = respBytes[2] | (respBytes[3] << 8);
  const expectedRespCode = expectedCmdCode + 1;

  if (respCode !== expectedRespCode) {
    return {
      success: false,
      error: `Unexpected response code 0x${respCode.toString(16)} (expected 0x${expectedRespCode.toString(16)})`,
      respCode,
      data: respBytes,
    };
  }

  const data = respBytes.slice(4, 4 + dataLength);
  return { success: true, respCode, dataLength, data };
}

/**
 * Procyon USB Bridge - libusb0/WinUSB Direct
 *
 * Uses procyon-usb.exe (compiled C#) which handles USB I/O
 * via libusb0 DeviceIoControl or WinUSB API.
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
          resolve({ raw: output });
        }
      });
    });
  }

  /**
   * List all USB devices
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
   * Connect to Procyon device
   */
  async connect() {
    try {
      if (this.connected) {
        await this.disconnect();
      }

      const findResult = await this._exec(['find'], 3000);
      if (!findResult.found) {
        return {
          success: false,
          error: 'Procyon WinUSB device not found. Install WinUSB driver via Zadig.',
        };
      }

      console.log('[USB] Found Procyon device:', findResult.path);

      const connectResult = await this._exec(['connect'], 3000);
      if (connectResult.connected) {
        this.connected = true;
        console.log('[USB] Connected, method:', connectResult.method);
        return { success: true };
      } else {
        return {
          success: false,
          error: connectResult.error || 'Connection failed',
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
   * Send raw hex command and read response
   * Uses procyon-usb.exe sendread command
   */
  async _sendRawHex(hexData, timeout = 5000) {
    if (!this.connected) {
      throw new Error('Device not connected');
    }

    const result = await this._exec(['sendread', hexData, String(timeout)], timeout + 2000);

    if (result.error) {
      throw new Error(result.error);
    }

    if (result.readError || result.winError) {
      throw new Error('No response from device (WinError=' + (result.winError || 0) + ')');
    }

    return this._hexToBytes(result.data || '');
  }

  /**
   * Send a command using the verified protocol and parse response
   * @param {number} cmdCode - 16-bit command code
   * @param {number[]} data - optional data bytes (for SET commands)
   * @param {number} timeout - read timeout in ms
   * @returns {object} parsed response with success, data, etc.
   */
  async sendCommand(cmdCode, data = [], timeout = 5000) {
    const packet = buildCommandPacket(cmdCode, data);
    const hexData = packet.toString('hex');

    console.log(`[USB] CMD 0x${cmdCode.toString(16).padStart(4, '0')} → ${hexData.substring(0, 16)}...`);

    const respBytes = await this._sendRawHex(hexData, timeout);
    const parsed = parseResponse(respBytes, cmdCode);

    if (parsed.success) {
      const dataHex = Array.from(parsed.data).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`[USB] RESP 0x${parsed.respCode.toString(16).padStart(4, '0')} len=${parsed.dataLength} [${dataHex}]`);
    } else {
      console.log(`[USB] RESP ERROR: ${parsed.error}`);
    }

    return parsed;
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
   * Parse null-terminated string from response data
   */
  _parseString(data, start = 0, maxLength = 255) {
    let str = '';
    for (let i = start; i < data.length && i < start + maxLength; i++) {
      if (data[i] === 0x00 || data[i] === 0xFF) break;
      str += String.fromCharCode(data[i]);
    }
    return str.trim();
  }

  /**
   * Parse IEEE 754 float from 4 bytes (little-endian)
   */
  _parseFloat(data, offset = 0) {
    if (!data || data.length < offset + 4) return 0;
    const buf = Buffer.from(data.slice(offset, offset + 4));
    return buf.readFloatLE(0);
  }

  /**
   * Parse 16-bit unsigned value (little-endian)
   */
  _parseU16(data, offset = 0) {
    if (!data || data.length < offset + 2) return 0;
    return data[offset] | (data[offset + 1] << 8);
  }

  /**
   * Parse 32-bit unsigned value (little-endian)
   */
  _parseU32(data, offset = 0) {
    if (!data || data.length < offset + 4) return 0;
    return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
  }

  // ============================================================
  // High-level device operations
  // ============================================================

  /**
   * Get device information (firmware, SN, battery, temperature, time)
   */
  async getDeviceInfo() {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }

      const info = {};

      // Firmware version (4 bytes: major.minor.patch.build)
      try {
        const fw = await this.sendCommand(CMD.GET_FIRMWARE_VERSION);
        if (fw.success && fw.data.length >= 4) {
          info.firmwareVersion = `${fw.data[0]}.${fw.data[1]}.${fw.data[2]}.${fw.data[3]}`;
        } else {
          info.firmwareVersion = 'N/A';
        }
      } catch (e) {
        console.log('[USB] Get firmware failed:', e.message);
        info.firmwareVersion = 'N/A';
      }

      // Battery voltage (4 bytes float)
      try {
        const batt = await this.sendCommand(CMD.GET_BATTERY_VOLTAGE);
        if (batt.success && batt.data.length >= 4) {
          info.batteryVoltage = Math.round(this._parseFloat(batt.data) * 100) / 100;
        } else {
          info.batteryVoltage = 0;
        }
      } catch (e) {
        console.log('[USB] Get battery failed:', e.message);
        info.batteryVoltage = 0;
      }

      // Temperature (4 bytes float, °C)
      try {
        const temp = await this.sendCommand(CMD.GET_TEMPERATURE_CM);
        if (temp.success && temp.data.length >= 4) {
          info.temperature = Math.round(this._parseFloat(temp.data) * 100) / 100;
        } else {
          info.temperature = undefined;
        }
      } catch (e) {
        console.log('[USB] Get temperature failed:', e.message);
        info.temperature = undefined;
      }

      // Device time (6 bytes: YY-MM-DD-HH-MM-SS)
      try {
        const dt = await this.sendCommand(CMD.GET_DEVICE_TIME);
        if (dt.success && dt.data.length >= 6) {
          const y = 2000 + dt.data[0];
          const m = dt.data[1];
          const d = dt.data[2];
          const h = dt.data[3];
          const min = dt.data[4];
          const s = dt.data[5];
          info.deviceTime = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
      } catch (e) {
        console.log('[USB] Get device time failed:', e.message);
      }

      // Tool SN
      try {
        const sn = await this.sendCommand(CMD.GET_TOOL_SN);
        if (sn.success) {
          info.toolSN = this._parseString(sn.data) || '';
        } else {
          info.toolSN = '';
        }
      } catch (e) {
        console.log('[USB] Get Tool SN failed:', e.message);
        info.toolSN = '';
      }

      // Customer
      try {
        const cust = await this.sendCommand(CMD.GET_CUSTOMER);
        if (cust.success) {
          info.customer = this._parseString(cust.data) || '';
        } else {
          info.customer = '';
        }
      } catch (e) {
        console.log('[USB] Get Customer failed:', e.message);
        info.customer = '';
      }

      // Country
      try {
        const country = await this.sendCommand(CMD.GET_COUNTRY);
        if (country.success) {
          info.country = this._parseString(country.data) || '';
        } else {
          info.country = '';
        }
      } catch (e) {
        console.log('[USB] Get Country failed:', e.message);
        info.country = '';
      }

      // Pressure CM (12 bytes)
      try {
        const pressure = await this.sendCommand(CMD.GET_PRESSURE_CM);
        if (pressure.success) {
          info.pressureCM = Array.from(pressure.data);
        }
      } catch (e) {
        console.log('[USB] Get Pressure CM failed:', e.message);
      }

      return { success: true, info };
    } catch (error) {
      console.error('[USB] getDeviceInfo error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set tool serial number (placeholder - SET protocol TBD)
   */
  async setToolSN(sn) {
    // TODO: Implement once SET command codes and protocol are confirmed from DLL decompilation
    console.log('[USB] SET_TOOL_SN not yet implemented - pending DLL decompilation');
    return { success: false, error: 'SET commands not yet implemented' };
  }

  /**
   * Set run ID (placeholder - SET protocol TBD)
   */
  async setRunID(runId) {
    console.log('[USB] SET_RUN_ID not yet implemented - pending DLL decompilation');
    return { success: false, error: 'SET commands not yet implemented' };
  }

  /**
   * Set customer (placeholder - SET protocol TBD)
   */
  async setCustomer(customer) {
    console.log('[USB] SET_CUSTOMER not yet implemented - pending DLL decompilation');
    return { success: false, error: 'SET commands not yet implemented' };
  }

  /**
   * Set district (placeholder - SET protocol TBD)
   */
  async setDistrict(district) {
    console.log('[USB] SET_DISTRICT not yet implemented - pending DLL decompilation');
    return { success: false, error: 'SET commands not yet implemented' };
  }

  /**
   * Set country (placeholder - SET protocol TBD)
   */
  async setCountry(country) {
    console.log('[USB] SET_COUNTRY not yet implemented - pending DLL decompilation');
    return { success: false, error: 'SET commands not yet implemented' };
  }

  /**
   * Set depth out (placeholder - SET protocol TBD)
   */
  async setDepthOut(depth) {
    console.log('[USB] SET_DEPT_OUT not yet implemented - pending DLL decompilation');
    return { success: false, error: 'SET commands not yet implemented' };
  }

  /**
   * Get battery voltage
   */
  async getBatteryVoltage() {
    try {
      if (!this.connected) {
        return { success: false, voltage: 0, error: 'Device not connected' };
      }
      const resp = await this.sendCommand(CMD.GET_BATTERY_VOLTAGE);
      if (resp.success && resp.data.length >= 4) {
        return { success: true, voltage: Math.round(this._parseFloat(resp.data) * 100) / 100 };
      }
      return { success: false, voltage: 0 };
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
      const resp = await this.sendCommand(CMD.GET_TEMPERATURE_CM);
      if (resp.success && resp.data.length >= 4) {
        return { success: true, temperature: Math.round(this._parseFloat(resp.data) * 100) / 100 };
      }
      return { success: false, temperature: 0 };
    } catch (error) {
      return { success: false, temperature: 0, error: error.message };
    }
  }

  /**
   * Get record count from device memory
   */
  async getRecordCount() {
    try {
      if (!this.connected) {
        return { success: false, count: 0, error: 'Device not connected' };
      }
      const resp = await this.sendCommand(CMD.GET_RECORD_COUNT);
      if (resp.success && resp.data.length >= 4) {
        return { success: true, count: this._parseU32(resp.data) };
      }
      return { success: false, count: 0 };
    } catch (error) {
      return { success: false, count: 0, error: error.message };
    }
  }

  /**
   * Download one-second data from device memory
   * NOTE: Data download protocol needs verification - memory dump uses different commands
   */
  async downloadOneSecondData(options = {}) {
    try {
      if (!this.connected) {
        return { success: false, data: [], totalRecords: 0, error: 'Device not connected' };
      }

      // Get total record count
      const countResult = await this.getRecordCount();
      if (!countResult.success) {
        return { success: false, data: [], totalRecords: 0, error: countResult.error };
      }

      const totalRecords = countResult.count;
      const records = [];

      console.log('[USB] Starting download, records:', totalRecords);

      // TODO: Implement actual memory dump protocol
      // From DLL: GET_MEMORY_DUMP_CHUNK_SIZE, GET_MEMORY_DUMP_CHUNK_DATA,
      // GET_MEMORY_ERASE_PERCENT, MEMORY_DUMP_START
      // These use different command codes than simple GET

      return { success: true, data: records, totalRecords };
    } catch (error) {
      console.error('[USB] downloadOneSecondData error:', error);
      return { success: false, data: [], totalRecords: 0, error: error.message };
    }
  }

  /**
   * Run self test (placeholder - test protocol needs verification)
   */
  async runSelfTest() {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }

      // From DLL: SET_SELF_TEST_MODE sets mode, then results via GET_SELF_TEST_MODE_STATUS
      // and individual sensor test data commands
      console.log('[USB] Self test not yet fully implemented');
      return { success: false, error: 'Self test not yet implemented' };
    } catch (error) {
      console.error('[USB] runSelfTest error:', error);
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
        backend: 'libusb0-winusb',
        totalDevices: 0,
        devices: [],
        procyonDetail: null,
        usbTest: null,
      };

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

      try {
        const findResult = await this._exec(['find'], 3000);
        result.usbTest = {
          exeFound: true,
          deviceFound: findResult.found || false,
          devicePath: findResult.path || null,
          findError: findResult.error || null,
        };
      } catch (exeErr) {
        result.usbTest = {
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
module.exports = { bridge, PROCYON_VID, PROCYON_PID, CMD, buildCommandHeader, buildCommandPacket, parseResponse };
