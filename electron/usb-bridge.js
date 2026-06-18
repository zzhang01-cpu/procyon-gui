/**
 * Procyon CM USB Bridge — Direct node-usb implementation
 *
 * Uses the `usb` npm package (libusb native binding) for direct USB Bulk transfer.
 * No external procyon-usb.exe required.
 *
 * Device: VID=0x2269, PID=0xBEEF
 * Driver: WinUSB (install via Zadig, replaces libusb-win32)
 * Transfer: USB Bulk, EP1 OUT=0x01, EP1 IN=0x81, 64 bytes max packet
 * Interface: 1 (Interface 0 does not exist on this device)
 */

const usb = require('usb');

// ─── Device constants ────────────────────────────────────────────────────────
const PROCYON_VID = 0x2269;
const PROCYON_PID = 0xBEEF;
const EP_OUT_ADDR = 0x01;         // EP1 OUT
const EP_IN_ADDR = 0x81;          // EP1 IN
const WRITE_TIMEOUT = 1000;       // DLL: WriteToDeviceAsync timeout = 1000ms
const READ_TIMEOUT = 200;         // DLL: ReadFromDeviceAsync pre-determined = 200ms
const READ_TIMEOUT_UNKNOWN = 75;  // DLL: unknown length = 75ms
const SET_DELAY_MS = 50;          // DLL: EMSetInitParameters delay between SETs

// ─── Command codes (from DLL Command enum) ──────────────────────────────────
const CMD = {
  // GET commands
  GET_FIRMWARE_VERSION:       0x0005,
  GET_NUMBER_MEMORY_PARTITIONS: 0x000A,
  GET_MEMORY_DUMP_CHUNK_DATA: 0x0010,
  GET_PARTITION_WRITTEN_BYTE_COUNT: 0x0019,
  GET_PARTITION_NUMBER_CHUNKS_WRITTEN: 0x001B,
  GET_PARTITION_TOTAL_NUMBER_CHUNKS: 0x001D,
  GET_MEMORY_DUMP_CHUNK_SIZE: 0x001F,
  MEMORY_ERASE_USED:          0x0030,
  MEMORY_ERASE_ALL:           0x0032,
  GET_MEMORY_ERASE_PERCENT:   0x0034,
  MEMORY_DUMP_START:          0x000C,
  MEMORY_DUMP_END:            0x000E,
  GET_BATTERY_VOLTAGE:        0x0040,
  GET_DEVICE_TIME:            0x0042,
  SET_DEVICE_TIME:            0x0044,
  GET_TEMPERATURE_DATA_CM:    0x0046,
  GET_TEMPERATURE_DATA_EM:    0x00A0,
  GET_ROTATIONAL_DATA_EM:     0x00A2,
  GET_LOWSHOCK_DATA_EM:       0x00A4,
  GET_HIGHSHOCK_DATA_CM:      0x0094,
  GET_PRESSURE_DATA_EM:       0x00A6,
  GET_FLASH_TEST_DATA:        0x00A7,
  GET_LIMPET_DATA_EM:         0x00A8,
  GET_ROTATIONAL_DATA_CM:     0x0090,
  GET_LOWSHOCK_DATA_CM:       0x0092,
  GET_PRESSURE_DATA_CM:       0x0096,
  ERASE_INTERNAL_FLASH:       0x0050,
  FIRMWARE_UPDATE_BUFFER:     0x0052,
  START_VERIFICATION:         0x0054,
  VERIFY_STATUS:              0x0056,
  LAUNCH_DEVICE:              0x0058,
  UPDATE_STATE:               0x005A,
  ABORT_FIRMWARE_UPDATE:      0x005C,
  // Parameter commands (GET/SET pairs)
  SET_PARAMETERS_INTO_FLASH:  0x0100,
  GET_CUSTOMER:               0x0102,
  SET_CUSTOMER:               0x0104,
  GET_COUNTRY:                0x0106,
  SET_COUNTRY:                0x0108,
  GET_DISTRICT:               0x010A,
  SET_DISTRICT:               0x010C,
  GET_RUN_ID_TYPE:            0x010E,
  SET_RUN_ID_TYPE:            0x0110,
  GET_RUN_ID:                 0x0112,
  SET_RUN_ID:                 0x0114,
  GET_DEPT_OUT:               0x0116,
  SET_DEPT_OUT:               0x0118,
  GET_UNIQUE_ID:              0x011A,
  SET_UNIQUE_ID:              0x011C,
  GET_LDAP:                   0x011E,
  SET_LDAP:                   0x0120,
  GET_TOOL_TYPE:              0x0130,
  SET_TOOL_TYPE:              0x0132,
  GET_TOOL_AXIAL_POSITION:    0x0134,
  SET_TOOL_AXIAL_POSITION:    0x0136,
  GET_TOOL_SIZE:              0x0138,
  SET_TOOL_SIZE:              0x013A,
  GET_TOOL_POSITION:          0x013C,
  SET_TOOL_POSITION:          0x013E,
  GET_HOUSING_NUMBER:         0x0140,
  SET_HOUSING_NUMBER:         0x0142,
  GET_BHA_SERIAL_NUMBER:      0x0144,
  SET_BHA_SERIAL_NUMBER:      0x0146,
  GET_CONFIG_NAME:            0x0148,
  SET_CONFIG_NAME:            0x014A,
  GET_TOOL_SN:                0x014C,
  SET_TOOL_SN:                0x014E,
  GET_UH_CONNECTION_TYPE:     0x0160,
  SET_UH_CONNECTION_TYPE:     0x0162,
  GET_DH_CONNECTION_TYPE:     0x0164,
  SET_DH_CONNECTION_TYPE:     0x0166,
  GET_INT_PRESSURE_SENSOR_SN: 0x0168,
  SET_INT_PRESSURE_SENSOR_SN: 0x016A,
  GET_EXT_PRESSURE_SENSOR_SN: 0x016C,
  SET_EXT_PRESSURE_SENSOR_SN: 0x016E,
  GET_LIMPET_SENSOR_SN:       0x0170,
  SET_LIMPET_SENSOR_SN:       0x0172,
  // Self test commands
  SET_SELF_TEST_MODE:         0x0064,
  GET_SELF_TEST_MODE_STATUS:  0x0066,
  GET_GYRO_SELF_TEST_DATA:    0x0068,
  GET_GYRO_ACCEL_SELF_TEST_DATA: 0x006A,
  GET_ACCEL_SELF_TEST_DATA:   0x006C,
  GET_SPI_TEST_DATA:          0x006E,
};

// ─── Packet helpers ─────────────────────────────────────────────────────────

/**
 * Build a command packet: [cmdlow, cmdhigh, lengthlow, lengthhigh, ...data]
 * From DLL IssueResponseInternal:
 *   cmdhigh = (byte)(command >> 8), cmdlow = (byte)(command & 0xFF)
 *   length = data.Length (0 for GET commands)
 *   Array is exactly 4 + data.length bytes — NO 0xFF padding
 */
function buildCommandPacket(commandCode, dataBytes = []) {
  const cmdlow = commandCode & 0xFF;
  const cmdhigh = (commandCode >> 8) & 0xFF;
  const len = dataBytes.length;
  const lengthlow = len & 0xFF;
  const lengthhigh = (len >> 8) & 0xFF;
  const packet = [cmdlow, cmdhigh, lengthlow, lengthhigh, ...dataBytes];
  return Buffer.from(packet);
}

/**
 * Parse a device response packet
 * Response format: [cmdlow_resp, cmdhigh_resp, lengthlow, lengthhigh, ...data]
 * Response code = request code + 1
 * Returns { commandCode, length, data } or null
 */
function parseResponse(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const cmdlow = buffer[0];
  const cmdhigh = buffer[1];
  const commandCode = (cmdhigh << 8) | cmdlow;
  const lengthlow = buffer[2];
  const lengthhigh = buffer[3];
  const length = (lengthhigh << 8) | lengthlow;
  const data = buffer.slice(4, 4 + length);
  return { commandCode, length, data };
}

/**
 * Convert string to ASCII byte array (matches DLL ASCIIconversion)
 * No null terminator, just (byte)char for each character
 */
function asciiToBytes(str) {
  if (!str) return [];
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xFF);
  }
  return bytes;
}

/**
 * Convert byte array to ASCII string
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

// ─── ProcyonUsbBridge class ─────────────────────────────────────────────────

class ProcyonUsbBridge {
  constructor() {
    this.device = null;     // usb.Device
    this.iface = null;      // usb.Interface
    this.epOut = null;      // usb.OutEndpoint
    this.epIn = null;       // usb.InEndpoint
    this.connected = false;
    this.deviceInfo = null;
  }

  // ─── Connection management ──────────────────────────────────────────────

  /**
   * Find and connect to the Procyon device
   */
  async connect() {
    try {
      if (this.connected) {
        return { success: true, message: 'Already connected' };
      }

      // Find device
      const deviceList = usb.getDeviceList();
      const procyonDev = deviceList.find(d => {
        const desc = d.deviceDescriptor;
        return desc && desc.idVendor === PROCYON_VID && desc.idProduct === PROCYON_PID;
      });

      if (!procyonDev) {
        return { success: false, error: 'Procyon device not found (VID=0x2269 PID=0xBEEF). Check USB cable and WinUSB driver.' };
      }

      this.device = procyonDev;

      // Open device
      try {
        this.device.open();
      } catch (openErr) {
        return { success: false, error: `Cannot open device: ${openErr.message}. May need WinUSB driver (use Zadig).` };
      }

      // Use device.interfaces array directly (node-usb v2)
      // device.interface(n) looks up by bInterfaceNumber, NOT by index
      // For Procyon, bInterfaceNumber=1 is the only usable interface
      const interfaces = this.device.interfaces || [];
      console.log(`[USB] Device has ${interfaces.length} interface(s)`);

      // Log all interfaces for debugging
      for (const ifc of interfaces) {
        const ifcDesc = ifc.descriptor;
        const eps = ifcDesc.endpoints.map(e =>
          `EP 0x${e.bEndpointAddress.toString(16)} (${e.bEndpointAddress & 0x80 ? 'IN' : 'OUT'})`
        ).join(', ');
        console.log(`[USB] Interface bInterfaceNumber=${ifcDesc.bInterfaceNumber}: class=${ifcDesc.bInterfaceClass}, eps=[${eps}]`);
      }

      // Try to claim an interface that has EP1 OUT (0x01) and EP1 IN (0x81)
      let claimed = false;
      for (const ifc of interfaces) {
        const ifcDesc = ifc.descriptor;
        const ifNum = ifcDesc.bInterfaceNumber;
        const hasEpOut = ifcDesc.endpoints.some(e => e.bEndpointAddress === EP_OUT_ADDR);
        const hasEpIn = ifcDesc.endpoints.some(e => e.bEndpointAddress === EP_IN_ADDR);

        console.log(`[USB] Interface ${ifNum}: hasEpOut=${hasEpOut}, hasEpIn=${hasEpIn}`);

        if (!hasEpOut || !hasEpIn) {
          console.log(`[USB] Interface ${ifNum}: missing required endpoints, skipping`);
          continue;
        }

        try {
          if (ifc.isKernelDriverActive()) {
            ifc.detachKernelDriver();
          }
        } catch (detachErr) {
          console.log(`[USB] Interface ${ifNum}: could not detach kernel driver: ${detachErr.message}`);
        }

        try {
          ifc.claim();
          this.iface = ifc;
          console.log(`[USB] Successfully claimed interface ${ifNum}`);
          claimed = true;
          break;
        } catch (claimErr) {
          console.log(`[USB] Interface ${ifNum}: claim failed: ${claimErr.message}`);
        }
      }

      if (!claimed) {
        this.device.close();
        this.device = null;
        return {
          success: false,
          error: `Cannot claim any USB interface with EP1 OUT/IN. ` +
            `Device has ${interfaces.length} interface(s). ` +
            `Make sure WinUSB driver is installed via Zadig.`
        };
      }

      // Get endpoints
      const ifaceDesc = this.iface.descriptor;
      const epOutDesc = ifaceDesc.endpoints.find(e => e.bEndpointAddress === EP_OUT_ADDR);
      const epInDesc = ifaceDesc.endpoints.find(e => e.bEndpointAddress === EP_IN_ADDR);

      if (!epOutDesc || !epInDesc) {
        this.iface.release(true, () => {});
        this.device.close();
        this.device = null;
        return { success: false, error: 'Required USB endpoints not found (EP1 OUT=0x01, EP1 IN=0x81)' };
      }

      this.epOut = this.iface.endpoint(EP_OUT_ADDR);
      this.epIn = this.iface.endpoint(EP_IN_ADDR);

      this.connected = true;

      // Read device info
      await this._readDeviceInfo();

      console.log('[USB] Connected to Procyon device');
      return { success: true, message: 'Connected to Procyon device' };
    } catch (error) {
      this.connected = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect() {
    try {
      if (this.iface) {
        try {
          this.iface.release(true, () => {});
        } catch (e) {
          // ignore release errors
        }
        this.iface = null;
      }
      if (this.device) {
        try {
          this.device.close();
        } catch (e) {
          // ignore close errors
        }
        this.device = null;
      }
      this.epOut = null;
      this.epIn = null;
      this.connected = false;
      this.deviceInfo = null;
      console.log('[USB] Disconnected');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Read device identification info
   */
  async _readDeviceInfo() {
    try {
      const fw = await this.getFirmwareVersion();
      const sn = await this.getToolSN();
      const uid = await this.getUniqueID();
      this.deviceInfo = {
        firmwareVersion: fw.success ? fw.value : 'unknown',
        serialNumber: sn.success ? sn.value : 'unknown',
        uniqueId: uid.success ? uid.value : 'unknown',
      };
    } catch (e) {
      this.deviceInfo = { firmwareVersion: 'unknown', serialNumber: 'unknown', uniqueId: 'unknown' };
    }
  }

  // ─── Low-level USB transfer ─────────────────────────────────────────────

  /**
   * Write bytes to EP1 OUT
   * From DLL: WriteToDeviceAsync — writes exact bytes, 1000ms timeout
   */
  async _writeToDevice(buffer) {
    return new Promise((resolve, reject) => {
      if (!this.epOut) {
        return reject(new Error('EP OUT not available'));
      }
      this.epOut.transfer(buffer, (err) => {
        if (err) {
          console.error('[USB] Write error:', err.message);
          reject(new Error(`USB write failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Read bytes from EP1 IN
   * From DLL: ReadFromDeviceAsync — reads with timeout, accumulates until no more data
   * @param {number} expectedLength - expected response length (default 64)
   * @param {number} timeout - read timeout in ms (default 200 for pre-determined)
   */
  async _readFromDevice(expectedLength = 64, timeout = READ_TIMEOUT) {
    return new Promise((resolve, reject) => {
      if (!this.epIn) {
        return reject(new Error('EP IN not available'));
      }

      const buf = Buffer.alloc(expectedLength);
      this.epIn.transfer(expectedLength, (err, receivedBuf, bytesReceived) => {
        if (err) {
          if (err.errno === usb.LIBUSB_ERROR_TIMEOUT) {
            // Timeout — return whatever we got
            if (bytesReceived > 0 && receivedBuf) {
              resolve(receivedBuf.slice(0, bytesReceived));
            } else {
              resolve(null);
            }
          } else {
            reject(new Error(`USB read failed: ${err.message}`));
          }
        } else {
          const data = receivedBuf ? receivedBuf.slice(0, bytesReceived || receivedBuf.length) : null;
          resolve(data);
        }
      });
    });
  }

  /**
   * Send a command and read the response
   * From DLL: CommandDeviceAsync flow:
   *   1. Build packet [cmdlow, cmdhigh, lengthlow, lengthhigh, ...data]
   *   2. WriteToDeviceAsync(packet)
   *   3. ReadFromDeviceAsync(responseLength, isLengthPreDetermined)
   *
   * For GET commands: data is empty, length=0, send 4-byte packet
   * For SET commands: data = ASCII bytes, length = data.length
   * Response code = request code + 1
   *
   * @param {number} commandCode - Command code from CMD enum
   * @param {number[]} dataBytes - Optional data payload (empty for GET)
   * @returns {object} { success, data, value, error }
   */
  async sendCommand(commandCode, dataBytes = []) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }

      const packet = buildCommandPacket(commandCode, dataBytes);
      console.log(`[USB] TX CMD 0x${commandCode.toString(16).padStart(4, '0')}: [${Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(', ')}]`);

      // Write
      await this._writeToDevice(packet);

      // Read response — try reading with generous buffer
      // DLL reads with expectedResponseLength and isLengthPreDetermined from CommandConfigurations
      // We'll read up to 4096 bytes (more than any expected response)
      const response = await this._readFromDevice(4096, READ_TIMEOUT);

      if (!response || response.length < 4) {
        console.log(`[USB] RX: no response or too short (${response ? response.length : 0} bytes)`);
        return { success: false, error: 'No response from device (timeout)' };
      }

      console.log(`[USB] RX: [${Array.from(response).map(b => b.toString(16).padStart(2, '0')).join(', ')}]`);

      const parsed = parseResponse(response);
      if (!parsed) {
        return { success: false, error: 'Invalid response format' };
      }

      // Verify response code = request code + 1
      const expectedRespCode = commandCode + 1;
      if (parsed.commandCode !== expectedRespCode) {
        console.log(`[USB] Response code 0x${parsed.commandCode.toString(16)} != expected 0x${expectedRespCode.toString(16)}`);
        // Still return the data — some commands may have different response codes
      }

      // Convert data to ASCII string for string-type responses
      const value = bytesToAscii(parsed.data);

      return { success: true, data: parsed.data, value, commandCode: parsed.commandCode, length: parsed.length };
    } catch (error) {
      console.error(`[USB] sendCommand error:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a GET command (no data payload, length=0)
   */
  async sendGetCommand(commandCode) {
    return this.sendCommand(commandCode, []);
  }

  /**
   * Send a SET string command
   * From DLL: ASCIIconversion -> IssueResponseInternal -> CommandDeviceAsync
   * Response: value != "0" and value != null means success
   */
  async sendSetCommand(commandCode, stringValue) {
    const dataBytes = asciiToBytes(stringValue);
    const result = await this.sendCommand(commandCode, dataBytes);

    if (!result.success) {
      return result;
    }

    // DLL: return valueFromResponse != "0" && valueFromResponse != null
    if (result.value === '0' || result.value === '') {
      return { success: false, error: 'Device returned 0 (failure)', value: result.value };
    }

    return result;
  }

  /**
   * Send an ACK-only command (no data, just check for non-null response)
   * From DLL: AckResponseAsync — if IssueResponseAsync returns non-null, success
   */
  async sendAckCommand(commandCode, dataBytes = []) {
    const result = await this.sendCommand(commandCode, dataBytes);

    if (!result.success) {
      return result;
    }

    // AckResponseAsync: any non-null response means success
    return { success: true };
  }

  // ─── GET commands ──────────────────────────────────────────────────────

  async getFirmwareVersion() {
    try {
      const resp = await this.sendGetCommand(CMD.GET_FIRMWARE_VERSION);
      if (resp.success && resp.data && resp.data.length >= 6) {
        // Firmware version: 3 bytes [Major, Minor, Patch]
        const major = resp.data[0];
        const minor = resp.data[1];
        const patch = resp.data[2];
        return { success: true, value: `${major}.${minor}.${patch}` };
      }
      return { success: false, value: null };
    } catch (error) {
      return { success: false, value: null, error: error.message };
    }
  }

  async getBatteryVoltage() {
    try {
      const resp = await this.sendGetCommand(CMD.GET_BATTERY_VOLTAGE);
      if (resp.success && resp.data && resp.data.length >= 4) {
        const voltage = this._parseFloat(resp.data);
        return { success: true, voltage: Math.round(voltage * 100) / 100 };
      }
      return { success: false, voltage: 0 };
    } catch (error) {
      return { success: false, voltage: 0, error: error.message };
    }
  }

  async getDeviceTime() {
    try {
      const resp = await this.sendGetCommand(CMD.GET_DEVICE_TIME);
      if (resp.success && resp.data && resp.data.length >= 4) {
        // 4-byte Unix timestamp (little-endian)
        const ts = resp.data.readUInt32LE(0);
        return { success: true, timestamp: ts, date: new Date(ts * 1000).toISOString() };
      }
      return { success: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getTemperature() {
    try {
      const resp = await this.sendGetCommand(CMD.GET_TEMPERATURE_DATA_CM);
      if (resp.success && resp.data && resp.data.length >= 4) {
        const temp = this._parseFloat(resp.data);
        return { success: true, temperature: Math.round(temp * 100) / 100 };
      }
      return { success: false, temperature: 0 };
    } catch (error) {
      return { success: false, temperature: 0, error: error.message };
    }
  }

  // String GET commands — these return ASCII string values
  async getCustomer()      { return this._getStringParam(CMD.GET_CUSTOMER); }
  async getCountry()       { return this._getStringParam(CMD.GET_COUNTRY); }
  async getDistrict()      { return this._getStringParam(CMD.GET_DISTRICT); }
  async getRunIDType()     { return this._getStringParam(CMD.GET_RUN_ID_TYPE); }
  async getRunID()         { return this._getStringParam(CMD.GET_RUN_ID); }
  async getDepthOut()      { return this._getStringParam(CMD.GET_DEPT_OUT); }
  async getUniqueID()      { return this._getStringParam(CMD.GET_UNIQUE_ID); }
  async getLDAP()          { return this._getStringParam(CMD.GET_LDAP); }
  async getToolType()      { return this._getStringParam(CMD.GET_TOOL_TYPE); }
  async getToolSize()      { return this._getStringParam(CMD.GET_TOOL_SIZE); }
  async getToolPosition()  { return this._getStringParam(CMD.GET_TOOL_POSITION); }
  async getToolSN()        { return this._getStringParam(CMD.GET_TOOL_SN); }
  async getConfigName()    { return this._getStringParam(CMD.GET_CONFIG_NAME); }
  async getUHConnectionType()  { return this._getStringParam(CMD.GET_UH_CONNECTION_TYPE); }
  async getDHConnectionType()  { return this._getStringParam(CMD.GET_DH_CONNECTION_TYPE); }
  async getIntPressureSN()     { return this._getStringParam(CMD.GET_INT_PRESSURE_SENSOR_SN); }
  async getExtPressureSN()     { return this._getStringParam(CMD.GET_EXT_PRESSURE_SENSOR_SN); }
  async getLimpetSN()          { return this._getStringParam(CMD.GET_LIMPET_SENSOR_SN); }

  async _getStringParam(commandCode) {
    try {
      const resp = await this.sendGetCommand(commandCode);
      if (resp.success) {
        return { success: true, value: resp.value || '' };
      }
      return { success: false, value: '' };
    } catch (error) {
      return { success: false, value: '', error: error.message };
    }
  }

  // ─── SET commands ──────────────────────────────────────────────────────

  async setToolSN(val)            { return this.sendSetCommand(CMD.SET_TOOL_SN, val); }
  async setCustomer(val)          { return this.sendSetCommand(CMD.SET_CUSTOMER, val); }
  async setCountry(val)           { return this.sendSetCommand(CMD.SET_COUNTRY, val); }
  async setDistrict(val)          { return this.sendSetCommand(CMD.SET_DISTRICT, val); }
  async setRunIDType(val)         { return this.sendSetCommand(CMD.SET_RUN_ID_TYPE, val); }
  async setRunID(val)             { return this.sendSetCommand(CMD.SET_RUN_ID, val); }
  async setDepthOut(val)          { return this.sendSetCommand(CMD.SET_DEPT_OUT, val); }
  async setUniqueID(val)          { return this.sendSetCommand(CMD.SET_UNIQUE_ID, val); }
  async setLDAP(val)              { return this.sendSetCommand(CMD.SET_LDAP, val); }
  async setToolType(val)          { return this.sendSetCommand(CMD.SET_TOOL_TYPE, val); }
  async setToolPosition(val)      { return this.sendSetCommand(CMD.SET_TOOL_POSITION, val); }
  async setToolSize(val)          { return this.sendSetCommand(CMD.SET_TOOL_SIZE, val); }
  async setConfigName(val)        { return this.sendSetCommand(CMD.SET_CONFIG_NAME, val); }
  async setUHConnectionType(val)  { return this.sendSetCommand(CMD.SET_UH_CONNECTION_TYPE, val); }
  async setDHConnectionType(val)  { return this.sendSetCommand(CMD.SET_DH_CONNECTION_TYPE, val); }
  async setIntPressureSN(val)     { return this.sendSetCommand(CMD.SET_INT_PRESSURE_SENSOR_SN, val); }
  async setExtPressureSN(val)     { return this.sendSetCommand(CMD.SET_EXT_PRESSURE_SENSOR_SN, val); }
  async setLimpetSN(val)          { return this.sendSetCommand(CMD.SET_LIMPET_SENSOR_SN, val); }
  async setToolAxialPosition(val) { return this.sendSetCommand(CMD.SET_TOOL_AXIAL_POSITION, val); }

  /**
   * Set device time — sends 4-byte Unix timestamp (little-endian)
   * From DLL: SET_DEVICE_TIME = 68 (0x0044), data = 4-byte unix timestamp
   */
  async setDeviceTime(dateInput) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const date = dateInput ? new Date(dateInput) : new Date();
      const unixTs = Math.floor(date.getTime() / 1000);
      // 4-byte little-endian Unix timestamp
      const dataBytes = [
        unixTs & 0xFF,
        (unixTs >> 8) & 0xFF,
        (unixTs >> 16) & 0xFF,
        (unixTs >> 24) & 0xFF,
      ];
      return await this.sendCommand(CMD.SET_DEVICE_TIME, dataBytes);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Write all SET parameters into Flash memory
   * From DLL: WriteIntoFlashAsync -> AckResponseAsync(Command.SET_PARAMETERS_INTO_FLASH)
   * SET_PARAMETERS_INTO_FLASH = 0x0100, no data payload, just check for non-null response
   */
  async writeIntoFlash() {
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }
    console.log('[USB] Writing parameters into Flash...');
    const result = await this.sendAckCommand(CMD.SET_PARAMETERS_INTO_FLASH);
    if (result.success) {
      console.log('[USB] Flash write successful');
    } else {
      console.log('[USB] Flash write failed:', result.error);
    }
    return result;
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
    return await this.sendAckCommand(CMD.MEMORY_ERASE_USED);
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
    return await this.sendAckCommand(CMD.MEMORY_ERASE_ALL);
  }

  /**
   * Set all initialization parameters (EM variant) and write to Flash
   * Follows DLL EMSetInitParameters flow with 50ms delays
   */
  async setInitParameters(params) {
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }

    const results = {};

    // Order matches DLL EMSetInitParameters
    const steps = [
      ['customer',          () => this.setCustomer(params.customer || 'N/A')],
      ['country',           () => this.setCountry(params.country || 'N/A')],
      ['district',          () => this.setDistrict(params.district || 'N/A')],
      ['ldap',              () => this.setLDAP(params.ldap || 'N/A')],
      ['toolType',          () => this.setToolType(params.toolType || 'N/A')],
      ['toolPosition',      () => this.setToolPosition(params.toolPosition || 'N/A')],
      ['toolSN',            () => this.setToolSN(params.toolSN || 'N/A')],
      ['toolSize',          () => this.setToolSize(params.toolSize || 'N/A')],
      ['uhConnectionType',  () => this.setUHConnectionType(params.uhConnectionType || 'N/A')],
      ['dhConnectionType',  () => this.setDHConnectionType(params.dhConnectionType || 'N/A')],
      ['intPressureSN',     () => this.setIntPressureSN(params.intPressureSN || 'N/A')],
      ['extPressureSN',     () => this.setExtPressureSN(params.extPressureSN || 'N/A')],
      ['limpetSN',          () => this.setLimpetSN(params.limpetSN || 'N/A')],
      ['configName',        () => this.setConfigName(params.configName || 'N/A')],
      ['uniqueId',          () => this.setUniqueID(params.uniqueId || 'N/A')],
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
      await new Promise(resolve => setTimeout(resolve, SET_DELAY_MS));
    }

    const allSuccess = Object.values(results).every(v => v === true);

    let flashResult = { success: false };
    if (allSuccess) {
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
   * Get memory erase percentage
   */
  async getMemoryErasePercent() {
    try {
      const resp = await this.sendGetCommand(CMD.GET_MEMORY_ERASE_PERCENT);
      if (resp.success && resp.data && resp.data.length >= 2) {
        const percent = (resp.data[1] << 8) | resp.data[0];
        return { success: true, percent };
      }
      return { success: false, percent: 0 };
    } catch (error) {
      return { success: false, percent: 0, error: error.message };
    }
  }

  /**
   * Get number of memory partitions
   */
  async getMemoryPartitions() {
    try {
      const resp = await this.sendGetCommand(CMD.GET_NUMBER_MEMORY_PARTITIONS);
      if (resp.success && resp.data && resp.data.length >= 1) {
        const count = resp.data[0];
        return { success: true, count };
      }
      return { success: false, count: 0 };
    } catch (error) {
      return { success: false, count: 0, error: error.message };
    }
  }

  /**
   * Download one-second data from device memory
   * TODO: Full implementation — requires MEMORY_DUMP_START, chunk reads, MEMORY_DUMP_END
   */
  async downloadOneSecondData(options = {}) {
    return { success: false, error: 'Not yet implemented', records: [] };
  }

  /**
   * Run self-test sequence
   * TODO: Full implementation — requires SET_SELF_TEST_MODE, wait, GET results
   */
  async runSelfTest() {
    return { success: false, error: 'Not yet implemented', results: [] };
  }

  /**
   * Initialize logger configuration
   * TODO: Full implementation
   */
  async initializeLogger(config) {
    return { success: false, error: 'Not yet implemented' };
  }

  // ─── Utility functions ─────────────────────────────────────────────────

  /**
   * Parse IEEE 754 float from 4-byte little-endian buffer
   */
  _parseFloat(data) {
    if (!data || data.length < 4) return 0;
    const buf = Buffer.alloc(4);
    buf[0] = data[0];
    buf[1] = data[1];
    buf[2] = data[2];
    buf[3] = data[3];
    return buf.readFloatLE(0);
  }

  /**
   * Parse unsigned 32-bit int from 4-byte little-endian buffer
   */
  _parseU32(data) {
    if (!data || data.length < 4) return 0;
    const buf = Buffer.alloc(4);
    for (let i = 0; i < 4; i++) buf[i] = data[i];
    return buf.readUInt32LE(0);
  }

  /**
   * List all USB devices (for diagnostics)
   */
  listDevices() {
    try {
      const devices = usb.getDeviceList();
      return devices.map(d => {
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
    } catch (error) {
      return [];
    }
  }

  /**
   * Get device info
   */
  getDeviceInfo() {
    return this.deviceInfo;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Diagnose USB connection
   */
  async diagnose() {
    try {
      const result = {
        success: true,
        backend: 'node-usb-direct',
        totalDevices: 0,
        devices: [],
        procyonDetail: null,
      };

      try {
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

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

const bridge = new ProcyonUsbBridge();
module.exports = { bridge, PROCYON_VID, PROCYON_PID, CMD, buildCommandPacket, parseResponse };
