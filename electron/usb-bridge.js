const { execFile } = require('child_process');
const path = require('path');

const PROCYON_VID = 0x2269;
const PROCYON_PID = 0xBEEF;

// USB Endpoints
const EP_OUT = 0x01;
const EP_IN = 0x81;

// ============================================================
// Procyon CM Protocol - Full Command Codes (from DLL decompilation)
// ============================================================
// Protocol format: [cmd_low, cmd_high, length_low, length_high, ...data]
// - GET: length = 0, send exact 4 bytes (no padding needed)
// - SET: length = data.length, send 4 + data.length bytes (exact, no padding)
// - Response code = request code + 1
// - String parameters: ASCII conversion (each char → byte), no null terminator
// - 50ms delay required between SET commands
// - After all SETs, send SET_PARAMETERS_INTO_FLASH to persist to flash
// ============================================================

const CMD = {
  // --- Firmware / Device ---
  GET_FIRMWARE_VERSION:                     5,     // 0x0005
  GET_NUMBER_MEMORY_PARTITIONS:             10,    // 0x000A
  GET_MEMORY_DUMP_CHUNK_DATA:               16,    // 0x0010
  GET_PARTITION_WRITTEN_BYTE_COUNT:         25,    // 0x0019
  GET_PARTITION_NUMBER_CHUNKS_WRITTEN:       27,    // 0x001B
  GET_PARTITION_TOTAL_NUMBER_CHUNKS:         29,    // 0x001D
  GET_MEMORY_DUMP_CHUNK_SIZE:               31,    // 0x001F
  MEMORY_DUMP_START:                        12,    // 0x000C
  MEMORY_DUMP_END:                          14,    // 0x000E
  MEMORY_ERASE_USED:                        48,    // 0x0030
  MEMORY_ERASE_ALL:                         50,    // 0x0032
  GET_MEMORY_ERASE_PERCENT:                 52,    // 0x0034

  // --- Device Time ---
  GET_DEVICE_TIME:                          66,    // 0x0042
  SET_DEVICE_TIME:                          68,    // 0x0044

  // --- Firmware Update ---
  ERASE_INTERNAL_FLASH:                     80,    // 0x0050
  FIRMWARE_UPDATE_BUFFER:                   82,    // 0x0052
  START_VERIFICATION:                       84,    // 0x0054
  VERIFY_STATUS:                            86,    // 0x0056
  LAUNCH_DEVICE:                            88,    // 0x0058
  UPDATE_STATE:                             90,    // 0x005A
  ABORT_FIRMWARE_UPDATE:                    92,    // 0x005C

  // --- Sensor Data (CM) ---
  GET_TEMPERATURE_DATA_CM:                  70,    // 0x0046
  GET_ROTATIONAL_DATA_CM:                   144,   // 0x0090
  GET_LOWSHOCK_DATA_CM:                     146,   // 0x0092
  GET_HIGHSHOCK_DATA_CM:                    148,   // 0x0094
  GET_PRESSURE_DATA_CM:                     150,   // 0x0096

  // --- Battery / Flash Test ---
  GET_BATTERY_VOLTAGE:                      64,    // 0x0040
  GET_FLASH_TEST_DATA:                      167,   // 0x00A7

  // --- Flash Persist ---
  SET_PARAMETERS_INTO_FLASH:                256,   // 0x0100

  // --- Sensor Data (EM) ---
  GET_TEMPERATURE_DATA_EM:                  160,   // 0x00A0
  GET_ROTATIONAL_DATA_EM:                   162,   // 0x00A2
  GET_LOWSHOCK_DATA_EM:                     164,   // 0x00A4
  GET_PRESSURE_DATA_EM:                     166,   // 0x00A6
  GET_LIMPET_DATA_EM:                       168,   // 0x00A8

  // --- Customer / Region ---
  GET_CUSTOMER:                             258,   // 0x0102
  SET_CUSTOMER:                             260,   // 0x0104
  GET_COUNTRY:                              262,   // 0x0106
  SET_COUNTRY:                              264,   // 0x0108
  GET_DISTRICT:                             266,   // 0x010A
  SET_DISTRICT:                             268,   // 0x010C

  // --- Run ID ---
  GET_RUN_ID_TYPE:                          270,   // 0x010E
  SET_RUN_ID_TYPE:                          272,   // 0x0110
  GET_RUN_ID:                               274,   // 0x0112
  SET_RUN_ID:                               276,   // 0x0114

  // --- Depth / Unique ---
  GET_DEPT_OUT:                             278,   // 0x0116
  SET_DEPT_OUT:                             280,   // 0x0118
  GET_UNIQUE_ID:                            282,   // 0x011A
  SET_UNIQUE_ID:                            284,   // 0x011C

  // --- LDAP ---
  GET_LDAP:                                 286,   // 0x011E
  SET_LDAP:                                 288,   // 0x0120

  // --- Tool Info ---
  GET_TOOL_TYPE:                            304,   // 0x0130
  SET_TOOL_TYPE:                            306,   // 0x0132
  GET_TOOL_AXIAL_POSITION:                  308,   // 0x0134
  SET_TOOL_AXIAL_POSITION:                  310,   // 0x0136
  GET_TOOL_SIZE:                            312,   // 0x0138
  SET_TOOL_SIZE:                            314,   // 0x013A
  GET_TOOL_POSITION:                        316,   // 0x013C
  SET_TOOL_POSITION:                        318,   // 0x013E

  // --- Serial Numbers ---
  GET_HOUSING_NUMBER:                       320,   // 0x0140
  SET_HOUSING_NUMBER:                       322,   // 0x0142
  GET_BHA_SERIAL_NUMBER:                    324,   // 0x0144
  SET_BHA_SERIAL_NUMBER:                    326,   // 0x0146
  GET_CONFIG_NAME:                          328,   // 0x0148
  SET_CONFIG_NAME:                          330,   // 0x014A
  GET_TOOL_SN:                              332,   // 0x014C
  SET_TOOL_SN:                              334,   // 0x014E

  // --- Drill Bit ---
  GET_DRILL_BIT_INFO_BIT_BOM:               336,   // 0x0150
  SET_DRILL_BIT_INFO_BIT_BOM:               338,   // 0x0152
  GET_DRILL_BIT_INFO_BIT_BLADE_NUMBER:      340,   // 0x0154
  SET_DRILL_BIT_INFO_BIT_BLADE_NUMBER:      342,   // 0x0156

  // --- Connection Types ---
  GET_UH_CONNECTION_TYPE:                   352,   // 0x0160
  SET_UH_CONNECTION_TYPE:                   354,   // 0x0162
  GET_DH_CONNECTION_TYPE:                   356,   // 0x0164
  SET_DH_CONNECTION_TYPE:                   358,   // 0x0166

  // --- Pressure Sensors ---
  GET_INT_PRESSURE_SENSOR_SERIAL_NUMBER:    360,   // 0x0168
  SET_INT_PRESSURE_SENSOR_SERIAL_NUMBER:    362,   // 0x016A
  GET_EXT_PRESSURE_SENSOR_SERIAL_NUMBER:    364,   // 0x016C
  SET_EXT_PRESSURE_SENSOR_SERIAL_NUMBER:    366,   // 0x016E
  GET_LIMPET_SENSOR_SERIAL_NUMBER:          368,   // 0x0170
  SET_LIMPET_SENSOR_SERIAL_NUMBER:          370,   // 0x0172

  // --- Self Test ---
  SET_SELF_TEST_MODE:                       0x0057,
  GET_SELF_TEST_MODE_STATUS:                0x0058,
  GET_ACCEL_SELF_TEST_DATA:                 0x005A,
  GET_GYRO_SELF_TEST_DATA:                  0x005C,
  GET_GYRO_ACCEL_SELF_TEST_DATA:            0x005E,
};

/**
 * Build a complete command packet (exact bytes, no padding)
 * GET: 4-byte header only [cmd_low, cmd_high, 0, 0]
 * SET: 4-byte header + data bytes [cmd_low, cmd_high, len_low, len_high, ...data]
 *
 * Per DLL decompilation (CommandDeviceAsync):
 *   array = new byte[4 + (data?.Length ?? 0)]
 *   array[0] = cmdlow, array[1] = cmdhigh, array[2] = lengthlow, array[3] = lengthhigh
 *   Array.Copy(data, 0, array, 4, data.Length)
 *   WriteToDeviceAsync(array)  // exact length, NO 64-byte padding
 */
function buildCommandPacket(cmdCode, data = []) {
  const dataLen = data.length;
  const packet = Buffer.alloc(4 + dataLen);
  packet[0] = cmdCode & 0xFF;           // cmd_low
  packet[1] = (cmdCode >> 8) & 0xFF;    // cmd_high
  packet[2] = dataLen & 0xFF;           // length_low
  packet[3] = (dataLen >> 8) & 0xFF;    // length_high
  for (let i = 0; i < dataLen; i++) {
    packet[4 + i] = data[i];
  }
  return packet;
}

/**
 * Convert string to ASCII byte array (per DLL DeviceResponseHelper.ASCIIconversion)
 * Each character → its byte value. No null terminator, no length prefix.
 */
function asciiToBytes(str) {
  if (!str || str.length === 0) return [];
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xFF);
  }
  return bytes;
}

/**
 * Convert byte array to ASCII string (reverse of asciiToBytes)
 */
function bytesToAscii(bytes) {
  if (!bytes || bytes.length === 0) return '';
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) break; // null terminator
    str += String.fromCharCode(bytes[i]);
  }
  return str;
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
   * SET command helper - sends a SET command with ASCII string data
   * Follows DLL protocol: ASCIIconversion → IssueResponseInternal → CommandDevice
   * Packet format: [cmdlow, cmdhigh, lengthlow, lengthhigh, ...dataBytes]
   * length = dataBytes.length (0 if no data)
   * @param {number} cmdCode - 16-bit SET command code (e.g., CMD.SET_TOOL_SN = 0x014E)
   * @param {string} value - string value to set
   * @returns {object} { success: boolean, response: string|null }
   */
  async _setStringParam(cmdCode, value) {
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }
    const dataBytes = asciiToBytes(value);
    const resp = await this.sendCommand(cmdCode, dataBytes);
    if (resp.success) {
      // DLL: GetValueFromResponse reads response data after 4-byte header,
      // formats via CommandResponseConfig, and checks last ByteConfig field.
      // For SET commands, the response is an ASCII string value.
      // "0" means failure, non-"0" non-null means success.
      // Read all data after header as ASCII string for proper comparison.
      const ackString = resp.data.length > 0
        ? resp.data.map(b => String.fromCharCode(b)).join('')
        : null;
      if (ackString === '0') {
        return { success: false, error: 'Device returned 0 (rejected)', response: ackString };
      }
      if (ackString === null) {
        return { success: false, error: 'No response data' };
      }
      return { success: true, response: ackString };
    }
    return { success: false, error: resp.error || 'No response' };
  }

  /**
   * SET command helper for integer/numeric parameters
   * @param {number} cmdCode - 16-bit SET command code
   * @param {number} value - numeric value to set
   * @param {number} byteCount - number of bytes (1, 2, or 4)
   * @returns {object} { success: boolean }
   */
  async _setNumericParam(cmdCode, value, byteCount = 1) {
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }
    const dataBytes = [];
    for (let i = 0; i < byteCount; i++) {
      dataBytes.push((value >> (i * 8)) & 0xFF);
    }
    const resp = await this.sendCommand(cmdCode, dataBytes);
    if (resp.success) {
      // Same ACK logic as _setStringParam: read data after header as ASCII string
      const ackString = resp.data.length > 0
        ? resp.data.map(b => String.fromCharCode(b)).join('')
        : null;
      if (ackString === '0') {
        return { success: false, error: 'Device returned 0 (rejected)', response: ackString };
      }
      if (ackString === null) {
        return { success: false, error: 'No response data' };
      }
      return { success: true, response: ackString };
    }
    return { success: false, error: resp.error || 'No response' };
  }

  // ---- Individual SET Commands (from DLL decompilation) ----

  async setToolSN(sn) {
    return this._setStringParam(CMD.SET_TOOL_SN, sn);
  }

  async setRunID(runId) {
    return this._setStringParam(CMD.SET_RUN_ID, runId);
  }

  async setRunIDType(runIdType) {
    return this._setStringParam(CMD.SET_RUN_ID_TYPE, runIdType);
  }

  async setCustomer(customer) {
    return this._setStringParam(CMD.SET_CUSTOMER, customer);
  }

  async setDistrict(district) {
    return this._setStringParam(CMD.SET_DISTRICT, district);
  }

  async setCountry(country) {
    return this._setStringParam(CMD.SET_COUNTRY, country);
  }

  async setDepthOut(depth) {
    return this._setStringParam(CMD.SET_DEPT_OUT, depth);
  }

  async setLDAP(ldap) {
    return this._setStringParam(CMD.SET_LDAP, ldap);
  }

  async setUniqueID(uniqueId) {
    return this._setStringParam(CMD.SET_UNIQUE_ID, uniqueId);
  }

  async setToolType(toolType) {
    return this._setStringParam(CMD.SET_TOOL_TYPE, toolType);
  }

  async setToolPosition(position) {
    return this._setStringParam(CMD.SET_TOOL_POSITION, position);
  }

  async setToolSize(size) {
    return this._setStringParam(CMD.SET_TOOL_SIZE, size);
  }

  async setToolAxialPosition(axial) {
    return this._setStringParam(CMD.SET_TOOL_AXIAL_POSITION, axial);
  }

  async setConfigName(configName) {
    return this._setStringParam(CMD.SET_CONFIG_NAME, configName);
  }

  async setUHConnectionType(connType) {
    return this._setStringParam(CMD.SET_UH_CONNECTION_TYPE, connType);
  }

  async setDHConnectionType(connType) {
    return this._setStringParam(CMD.SET_DH_CONNECTION_TYPE, connType);
  }

  async setIntPressureSN(sn) {
    return this._setStringParam(CMD.SET_INT_PRESSURE_SENSOR_SN, sn);
  }

  async setExtPressureSN(sn) {
    return this._setStringParam(CMD.SET_EXT_PRESSURE_SENSOR_SN, sn);
  }

  async setLimpetSN(sn) {
    return this._setStringParam(CMD.SET_LIMPET_SENSOR_SN, sn);
  }

  async setDeviceTime(date) {
    // date: ISO date string (e.g. "2025-01-15T10:30:00.000Z") or { year, month, day, hour, minute, second }
    // From DLL: SET_DEVICE_TIME = 0x0044, data = [YY, MM, DD, HH, MM, SS]
    let dataBytes;
    if (typeof date === 'string') {
      // Parse ISO string
      const d = new Date(date);
      dataBytes = [
        d.getFullYear() - 2000,
        d.getMonth() + 1,
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
      ];
    } else if (date && typeof date === 'object') {
      dataBytes = [
        (date.year || 2025) - 2000,
        date.month || 1,
        date.day || 1,
        date.hour || 0,
        date.minute || 0,
        date.second || 0,
      ];
    } else {
      // Default: current time
      const now = new Date();
      dataBytes = [
        now.getFullYear() - 2000,
        now.getMonth() + 1,
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
      ];
    }
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }
    console.log('[USB] Setting device time:', dataBytes);
    const resp = await this.sendCommand(CMD.SET_DEVICE_TIME, dataBytes);
    if (resp.success) {
      return { success: true };
    }
    return { success: false, error: resp.error || 'No response' };
  }

  /**
   * Write all SET parameters into Flash memory
   * MUST be called after all SET commands to persist changes
   * From DLL: WriteIntoFlashAsync → AckResponseAsync(Command.SET_PARAMETERS_INTO_FLASH)
   */
  async writeIntoFlash() {
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }
    console.log('[USB] Writing parameters into Flash...');
    // SET_PARAMETERS_INTO_FLASH (0x0100) has no data payload
    const resp = await this.sendCommand(CMD.SET_PARAMETERS_INTO_FLASH);
    if (resp.success) {
      console.log('[USB] Flash write successful');
      return { success: true };
    }
    console.log('[USB] Flash write failed:', resp.error);
    return { success: false, error: resp.error || 'Flash write failed' };
  }

  /**
   * Erase used memory partitions
   * From DLL: AckResponseAsync(Command.MEMORY_ERASE_USED)
   */
  async eraseUsedMemory() {
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }
    console.log('[USB] Erasing used memory...');
    const resp = await this.sendCommand(CMD.MEMORY_ERASE_USED);
    if (resp.success) {
      console.log('[USB] Erase used memory initiated');
      return { success: true };
    }
    return { success: false, error: resp.error || 'Erase failed' };
  }

  /**
   * Erase all memory partitions
   * From DLL: AckResponseAsync(Command.MEMORY_ERASE_ALL)
   */
  async eraseAllMemory() {
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }
    console.log('[USB] Erasing all memory...');
    const resp = await this.sendCommand(CMD.MEMORY_ERASE_ALL);
    if (resp.success) {
      console.log('[USB] Erase all memory initiated');
      return { success: true };
    }
    return { success: false, error: resp.error || 'Erase failed' };
  }

  /**
   * Set all initialization parameters (EM variant) and write to Flash
   * Follows DLL EMSetInitParameters flow:
   *   1. Set each parameter sequentially
   *   2. 50ms delay between each SET command
   *   3. WriteIntoFlash at the end
   * @param {object} params - { customer, country, district, ldap, toolType,
   *   toolPosition, toolSN, toolSize, uhConnectionType, dhConnectionType,
   *   intPressureSN, extPressureSN, limpetSN, configName, uniqueId }
   * @returns {object} { success: boolean, results: object, flashResult: object }
   */
  async setInitParameters(params) {
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }

    const results = {};
    const SET_DELAY_MS = 50; // DLL uses Task.Delay(50) between each SET

    // Order matches DLL EMSetInitParameters
    const steps = [
      ['customer', () => this.setCustomer(params.customer || 'N/A')],
      ['country', () => this.setCountry(params.country || 'N/A')],
      ['district', () => this.setDistrict(params.district || 'N/A')],
      ['ldap', () => this.setLDAP(params.ldap || 'N/A')],
      ['toolType', () => this.setToolType(params.toolType || 'N/A')],
      ['toolPosition', () => this.setToolPosition(params.toolPosition || 'N/A')],
      ['toolSN', () => this.setToolSN(params.toolSN || 'N/A')],
      ['toolSize', () => this.setToolSize(params.toolSize || 'N/A')],
      ['uhConnectionType', () => this.setUHConnectionType(params.uhConnectionType || 'N/A')],
      ['dhConnectionType', () => this.setDHConnectionType(params.dhConnectionType || 'N/A')],
      ['intPressureSN', () => this.setIntPressureSN(params.intPressureSN || 'N/A')],
      ['extPressureSN', () => this.setExtPressureSN(params.extPressureSN || 'N/A')],
      ['limpetSN', () => this.setLimpetSN(params.limpetSN || 'N/A')],
      ['configName', () => this.setConfigName(params.configName || 'N/A')],
      ['uniqueId', () => this.setUniqueID(params.uniqueId || 'N/A')],
    ];

    for (const [name, fn] of steps) {
      try {
        const result = await fn();
        results[name] = result.success;
        console.log(`[USB] SET ${name}: ${result.success ? 'OK' : 'FAIL'}`);
      } catch (e) {
        results[name] = false;
        console.log(`[USB] SET ${name}: ERROR - ${e.message}`);
      }
      // 50ms delay between SET commands (from DLL)
      await new Promise(resolve => setTimeout(resolve, SET_DELAY_MS));
    }

    // Check if all succeeded
    const allSuccess = Object.values(results).every(v => v === true);

    let flashResult = { success: false };
    if (allSuccess) {
      // Write to Flash (from DLL: only write if all SETs succeed)
      flashResult = await this.writeIntoFlash();
    } else {
      console.log('[USB] Not all SETs succeeded, skipping Flash write');
    }

    return {
      success: allSuccess && flashResult.success,
      results,
      flashResult,
    };
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
module.exports = { bridge, PROCYON_VID, PROCYON_PID, CMD, buildCommandPacket, parseResponse };
