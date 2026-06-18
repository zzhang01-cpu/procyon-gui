/**
 * Procyon CM USB Bridge -- Direct node-usb implementation
 *
 * Uses the 'usb' npm package (libusb native binding) for direct USB Bulk transfer.
 * No external procyon-usb.exe required.
 *
 * Device: VID=0x2269, PID=0xBEEF
 * Driver: WinUSB (install via Zadig, replaces libusb-win32)
 * Transfer: USB Bulk, EP1 OUT=0x01, EP1 IN=0x81, 64 bytes max packet
 * Interface: 1 (Interface 0 does not exist on this device)
 *
 * NOTE: This file uses ONLY string concatenation (no template literals)
 * to avoid GBK encoding corruption on Windows systems.
 */

var usb = require('usb');

// -- Device constants --
var PROCYON_VID = 0x2269;
var PROCYON_PID = 0xBEEF;
var EP_OUT_ADDR = 0x01;         // EP1 OUT
var EP_IN_ADDR = 0x81;          // EP1 IN
var WRITE_TIMEOUT = 1000;       // DLL: WriteToDeviceAsync timeout = 1000ms
var READ_TIMEOUT = 200;         // DLL: ReadFromDeviceAsync pre-determined = 200ms
var READ_TIMEOUT_UNKNOWN = 75;  // DLL: unknown length = 75ms
var SET_DELAY_MS = 50;          // DLL: EMSetInitParameters delay between SETs

// -- Command codes (from DLL Command enum) --
var CMD = {
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

// -- Packet helpers --

/**
 * Build a command packet: [cmdlow, cmdhigh, lengthlow, lengthhigh, ...data]
 * From DLL IssueResponseInternal:
 *   cmdhigh = (byte)(command >> 8), cmdlow = (byte)(command & 0xFF)
 *   length = data.Length (0 for GET commands)
 *   Array is exactly 4 + data.length bytes -- NO 0xFF padding
 */
function buildCommandPacket(commandCode, dataBytes) {
  if (!dataBytes) dataBytes = [];
  var cmdlow = commandCode & 0xFF;
  var cmdhigh = (commandCode >> 8) & 0xFF;
  var len = dataBytes.length;
  var lengthlow = len & 0xFF;
  var lengthhigh = (len >> 8) & 0xFF;
  var packet = [cmdlow, cmdhigh, lengthlow, lengthhigh];
  for (var i = 0; i < dataBytes.length; i++) {
    packet.push(dataBytes[i]);
  }
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
  var cmdlow = buffer[0];
  var cmdhigh = buffer[1];
  var commandCode = (cmdhigh << 8) | cmdlow;
  var lengthlow = buffer[2];
  var lengthhigh = buffer[3];
  var length = (lengthhigh << 8) | lengthlow;
  var data = buffer.slice(4, 4 + length);
  return { commandCode: commandCode, length: length, data: data };
}

/**
 * Convert string to ASCII byte array (matches DLL ASCIIconversion)
 * No null terminator, just (byte)char for each character
 */
function asciiToBytes(str) {
  if (!str) return [];
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xFF);
  }
  return bytes;
}

/**
 * Convert byte array to ASCII string
 */
function bytesToAscii(bytes) {
  if (!bytes || bytes.length === 0) return '';
  var str = '';
  for (var i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) break; // null terminator
    str += String.fromCharCode(bytes[i]);
  }
  return str;
}

/**
 * Format a buffer as hex string for logging
 */
function hexStr(buf) {
  if (!buf) return '<null>';
  var parts = [];
  for (var i = 0; i < buf.length; i++) {
    var h = buf[i].toString(16).padStart(2, '0');
    parts.push(h);
  }
  return parts.join(', ');
}

/**
 * Format a number as 4-digit hex
 */
function hex4(n) {
  return '0x' + n.toString(16).padStart(4, '0');
}

// -- ProcyonUsbBridge class --

function ProcyonUsbBridge() {
  this.device = null;     // usb.Device
  this.iface = null;      // usb.Interface
  this.epOut = null;      // usb.OutEndpoint
  this.epIn = null;       // usb.InEndpoint
  this.connected = false;
  this.deviceInfo = null;
}

// -- Connection management --

/**
 * Find and connect to the Procyon device
 */
ProcyonUsbBridge.prototype.connect = async function() {
  var self = this;
  try {
    if (self.connected) {
      return { success: true, message: 'Already connected' };
    }

    // Find device
    var deviceList = usb.getDeviceList();
    var procyonDev = null;
    for (var i = 0; i < deviceList.length; i++) {
      var d = deviceList[i];
      var desc = d.deviceDescriptor;
      if (desc && desc.idVendor === PROCYON_VID && desc.idProduct === PROCYON_PID) {
        procyonDev = d;
        break;
      }
    }

    if (!procyonDev) {
      return { success: false, error: 'Procyon device not found (VID=0x2269 PID=0xBEEF). Check USB cable and WinUSB driver.' };
    }

    self.device = procyonDev;

    // Open device -- MUST call open() before claim() in node-usb v2
    try {
      self.device.open();
      console.log('[USB] Device opened successfully');
    } catch (openErr) {
      return { success: false, error: 'Cannot open device: ' + openErr.message + '. May need WinUSB driver (use Zadig).' };
    }

    // Use device.interfaces array directly (node-usb v2)
    var interfaces = self.device.interfaces || [];
    console.log('[USB] Device has ' + interfaces.length + ' interface(s)');

    // Log all interfaces for debugging
    for (var ii = 0; ii < interfaces.length; ii++) {
      var ifc = interfaces[ii];
      var ifcDesc = ifc.descriptor;
      var epParts = [];
      for (var ei = 0; ei < ifcDesc.endpoints.length; ei++) {
        var ep = ifcDesc.endpoints[ei];
        var dir = (ep.bEndpointAddress & 0x80) ? 'IN' : 'OUT';
        epParts.push('EP 0x' + ep.bEndpointAddress.toString(16) + ' (' + dir + ')');
      }
      console.log('[USB] Interface bInterfaceNumber=' + ifcDesc.bInterfaceNumber +
        ': class=' + ifcDesc.bInterfaceClass + ', eps=[' + epParts.join(', ') + ']');
    }

    // Try to claim an interface that has EP1 OUT (0x01) and EP1 IN (0x81)
    var claimed = false;

    // Method 1: iterate device.interfaces array
    for (var i1 = 0; i1 < interfaces.length; i1++) {
      var ifc1 = interfaces[i1];
      var ifcDesc1 = ifc1.descriptor;
      var ifNum = ifcDesc1.bInterfaceNumber;
      var hasEpOut = false;
      var hasEpIn = false;
      for (var ei1 = 0; ei1 < ifcDesc1.endpoints.length; ei1++) {
        if (ifcDesc1.endpoints[ei1].bEndpointAddress === EP_OUT_ADDR) hasEpOut = true;
        if (ifcDesc1.endpoints[ei1].bEndpointAddress === EP_IN_ADDR) hasEpIn = true;
      }

      console.log('[USB] Interface ' + ifNum + ': hasEpOut=' + hasEpOut + ', hasEpIn=' + hasEpIn);

      if (!hasEpOut || !hasEpIn) {
        console.log('[USB] Interface ' + ifNum + ': missing required endpoints, skipping');
        continue;
      }

      // On Windows + WinUSB, detachKernelDriver is not needed/supported.
      var isWindows = process.platform === 'win32';
      if (!isWindows) {
        try {
          if (ifc1.isKernelDriverActive()) {
            ifc1.detachKernelDriver();
          }
        } catch (detachErr) {
          console.log('[USB] Interface ' + ifNum + ': could not detach kernel driver: ' + detachErr.message);
        }
      }

      try {
        ifc1.claim();
        self.iface = ifc1;
        console.log('[USB] Successfully claimed interface ' + ifNum + ' (via interfaces array)');
        claimed = true;
        break;
      } catch (claimErr) {
        console.log('[USB] Interface ' + ifNum + ': claim failed: ' + claimErr.message);
      }
    }

    // Method 2: try device.interface(n) by bInterfaceNumber (fallback)
    if (!claimed) {
      console.log('[USB] Method 1 failed, trying device.interface(bInterfaceNumber)...');
      for (var bIfNum = 0; bIfNum <= 2; bIfNum++) {
        try {
          var ifc2 = self.device.interface(bIfNum);
          console.log('[USB] device.interface(' + bIfNum + ') found');
          ifc2.claim();
          self.iface = ifc2;
          console.log('[USB] Successfully claimed interface ' + bIfNum + ' (via device.interface())');
          claimed = true;
          break;
        } catch (err2) {
          console.log('[USB] device.interface(' + bIfNum + '): ' + err2.message);
        }
      }
    }

    // Method 3: On Windows, try resetting the device and retrying
    if (!claimed && process.platform === 'win32') {
      console.log('[USB] Method 2 failed, trying device reset + retry...');
      try {
        self.device.reset();
        console.log('[USB] Device reset successful, retrying claim...');
        // Small delay after reset
        await new Promise(function(r) { setTimeout(r, 500); });
        // Re-open after reset
        try {
          self.device.open();
          console.log('[USB] Re-opened device after reset');
        } catch (openErr) {
          console.log('[USB] Re-open after reset: ' + openErr.message);
        }

        // Refresh interfaces after reset
        var interfacesAfterReset = self.device.interfaces || [];
        for (var i3 = 0; i3 < interfacesAfterReset.length; i3++) {
          var ifc3 = interfacesAfterReset[i3];
          var ifNum3 = ifc3.descriptor.bInterfaceNumber;
          try {
            ifc3.claim();
            self.iface = ifc3;
            console.log('[USB] Successfully claimed interface ' + ifNum3 + ' after reset');
            claimed = true;
            break;
          } catch (claimErr3) {
            console.log('[USB] Interface ' + ifNum3 + ': claim after reset failed: ' + claimErr3.message);
          }
        }
      } catch (resetErr) {
        console.log('[USB] Device reset failed: ' + resetErr.message);
      }
    }

    if (!claimed) {
      // Diagnostic: check Windows device driver info
      console.log('[USB] DIAGNOSTIC: All claim attempts failed.');
      console.log('[USB] Device descriptor: ' + JSON.stringify(self.device.deviceDescriptor));
      for (var di = 0; di < interfaces.length; di++) {
        console.log('[USB] Interface[' + di + '] descriptor: ' + JSON.stringify(interfaces[di].descriptor));
      }
      console.log('[USB] TROUBLESHOOT: Open Zadig -> Options -> List All Devices');
      console.log('[USB] Check if the Procyon device appears with WinUSB driver.');
      console.log('[USB] If it shows as libusb-win32 or CDC, replace it with WinUSB.');
      console.log('[USB] For composite devices, you may need to replace the driver for EACH interface.');

      try { self.device.close(); } catch (e) {}
      self.device = null;
      return {
        success: false,
        error: 'Cannot claim USB interface. ' +
          'Please check: (1) Open Zadig, (2) Options -> List All Devices, ' +
          '(3) Find ALL entries for the Procyon device, (4) Replace ALL drivers to WinUSB. ' +
          'See PowerShell log for details.'
      };
    }

    // Get endpoints
    self.epOut = self.iface.endpoint(EP_OUT_ADDR);
    self.epIn = self.iface.endpoint(EP_IN_ADDR);

    if (!self.epOut || !self.epIn) {
      try { self.iface.release(true, function() {}); } catch (e) {}
      try { self.device.close(); } catch (e) {}
      self.device = null;
      return { success: false, error: 'Required USB endpoints not found (EP1 OUT=0x01, EP1 IN=0x81)' };
    }

    self.connected = true;

    // Read device info
    await self._readDeviceInfo();

    console.log('[USB] Connected to Procyon device');
    return { success: true, message: 'Connected to Procyon device' };
  } catch (error) {
    self.connected = false;
    return { success: false, error: error.message };
  }
};

/**
 * Disconnect from device
 */
ProcyonUsbBridge.prototype.disconnect = async function() {
  try {
    if (this.iface) {
      try { this.iface.release(true, function() {}); } catch (e) {}
      this.iface = null;
    }
    if (this.device) {
      try { this.device.close(); } catch (e) {}
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
};

/**
 * Read device identification info
 */
ProcyonUsbBridge.prototype._readDeviceInfo = async function() {
  try {
    var fw = await this.getFirmwareVersion();
    var sn = await this.getToolSN();
    var uid = await this.getUniqueID();
    this.deviceInfo = {
      firmwareVersion: fw.success ? fw.value : 'unknown',
      serialNumber: sn.success ? sn.value : 'unknown',
      uniqueId: uid.success ? uid.value : 'unknown',
    };
  } catch (e) {
    this.deviceInfo = { firmwareVersion: 'unknown', serialNumber: 'unknown', uniqueId: 'unknown' };
  }
};

// -- Low-level USB transfer --

/**
 * Write bytes to EP1 OUT
 * From DLL: WriteToDeviceAsync -- writes exact bytes, 1000ms timeout
 */
ProcyonUsbBridge.prototype._writeToDevice = function(buffer) {
  var self = this;
  return new Promise(function(resolve, reject) {
    if (!self.epOut) {
      return reject(new Error('EP OUT not available'));
    }
    self.epOut.transfer(buffer, function(err) {
      if (err) {
        console.error('[USB] Write error: ' + err.message);
        reject(new Error('USB write failed: ' + err.message));
      } else {
        resolve();
      }
    });
  });
};

/**
 * Read bytes from EP1 IN
 * From DLL: ReadFromDeviceAsync -- reads with timeout, accumulates until no more data
 */
ProcyonUsbBridge.prototype._readFromDevice = function(expectedLength, timeout) {
  if (!expectedLength) expectedLength = 64;
  if (!timeout) timeout = READ_TIMEOUT;
  var self = this;
  return new Promise(function(resolve, reject) {
    if (!self.epIn) {
      return reject(new Error('EP IN not available'));
    }

    self.epIn.transfer(expectedLength, function(err, receivedBuf, bytesReceived) {
      if (err) {
        if (err.errno === usb.LIBUSB_ERROR_TIMEOUT) {
          // Timeout -- return whatever we got
          if (bytesReceived > 0 && receivedBuf) {
            resolve(receivedBuf.slice(0, bytesReceived));
          } else {
            resolve(null);
          }
        } else {
          reject(new Error('USB read failed: ' + err.message));
        }
      } else {
        var data = receivedBuf ? receivedBuf.slice(0, bytesReceived || receivedBuf.length) : null;
        resolve(data);
      }
    });
  });
};

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
 */
ProcyonUsbBridge.prototype.sendCommand = async function(commandCode, dataBytes) {
  if (!dataBytes) dataBytes = [];
  try {
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }

    var packet = buildCommandPacket(commandCode, dataBytes);
    console.log('[USB] TX CMD ' + hex4(commandCode) + ': [' + hexStr(packet) + ']');

    // Write
    await this._writeToDevice(packet);

    // Read response -- try reading with generous buffer
    var response = await this._readFromDevice(4096, READ_TIMEOUT);

    if (!response || response.length < 4) {
      var rlen = response ? response.length : 0;
      console.log('[USB] RX: no response or too short (' + rlen + ' bytes)');
      return { success: false, error: 'No response from device (timeout)' };
    }

    console.log('[USB] RX: [' + hexStr(response) + ']');

    var parsed = parseResponse(response);
    if (!parsed) {
      return { success: false, error: 'Invalid response format' };
    }

    // Verify response code = request code + 1
    var expectedRespCode = commandCode + 1;
    if (parsed.commandCode !== expectedRespCode) {
      console.log('[USB] Response code ' + hex4(parsed.commandCode) + ' != expected ' + hex4(expectedRespCode));
      // Still return the data -- some commands may have different response codes
    }

    // Convert data to ASCII string for string-type responses
    var value = bytesToAscii(parsed.data);

    return { success: true, data: parsed.data, value: value, commandCode: parsed.commandCode, length: parsed.length };
  } catch (error) {
    console.error('[USB] sendCommand error: ' + error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send a GET command (no data payload, length=0)
 */
ProcyonUsbBridge.prototype.sendGetCommand = async function(commandCode) {
  return this.sendCommand(commandCode, []);
};

/**
 * Send a SET string command
 * From DLL: ASCIIconversion -> IssueResponseInternal -> CommandDeviceAsync
 * Response: value != "0" and value != null means success
 */
ProcyonUsbBridge.prototype.sendSetCommand = async function(commandCode, stringValue) {
  var dataBytes = asciiToBytes(stringValue);
  var result = await this.sendCommand(commandCode, dataBytes);

  if (!result.success) {
    return result;
  }

  // DLL: return valueFromResponse != "0" && valueFromResponse != null
  if (result.value === '0' || result.value === '') {
    return { success: false, error: 'Device returned 0 (failure)', value: result.value };
  }

  return result;
};

/**
 * Send an ACK-only command (no data, just check for non-null response)
 * From DLL: AckResponseAsync -- if IssueResponseAsync returns non-null, success
 */
ProcyonUsbBridge.prototype.sendAckCommand = async function(commandCode, dataBytes) {
  if (!dataBytes) dataBytes = [];
  var result = await this.sendCommand(commandCode, dataBytes);

  if (!result.success) {
    return result;
  }

  // AckResponseAsync: any non-null response means success
  return { success: true };
};

// -- GET commands --

ProcyonUsbBridge.prototype.getFirmwareVersion = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_FIRMWARE_VERSION);
    if (resp.success && resp.data && resp.data.length >= 6) {
      var major = resp.data[0];
      var minor = resp.data[1];
      var patch = resp.data[2];
      return { success: true, value: major + '.' + minor + '.' + patch };
    }
    return { success: false, value: null };
  } catch (error) {
    return { success: false, value: null, error: error.message };
  }
};

ProcyonUsbBridge.prototype.getBatteryVoltage = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_BATTERY_VOLTAGE);
    if (resp.success && resp.data && resp.data.length >= 4) {
      var voltage = this._parseFloat(resp.data);
      return { success: true, voltage: Math.round(voltage * 100) / 100 };
    }
    return { success: false, voltage: 0 };
  } catch (error) {
    return { success: false, voltage: 0, error: error.message };
  }
};

ProcyonUsbBridge.prototype.getDeviceTime = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_DEVICE_TIME);
    if (resp.success && resp.data && resp.data.length >= 4) {
      // 4-byte Unix timestamp (little-endian)
      var ts = resp.data.readUInt32LE(0);
      return { success: true, timestamp: ts, date: new Date(ts * 1000).toISOString() };
    }
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

ProcyonUsbBridge.prototype.getTemperature = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_TEMPERATURE_DATA_CM);
    if (resp.success && resp.data && resp.data.length >= 4) {
      var temp = this._parseFloat(resp.data);
      return { success: true, temperature: Math.round(temp * 100) / 100 };
    }
    return { success: false, temperature: 0 };
  } catch (error) {
    return { success: false, temperature: 0, error: error.message };
  }
};

// String GET commands
ProcyonUsbBridge.prototype.getCustomer = function()          { return this._getStringParam(CMD.GET_CUSTOMER); };
ProcyonUsbBridge.prototype.getCountry = function()           { return this._getStringParam(CMD.GET_COUNTRY); };
ProcyonUsbBridge.prototype.getDistrict = function()          { return this._getStringParam(CMD.GET_DISTRICT); };
ProcyonUsbBridge.prototype.getRunIDType = function()         { return this._getStringParam(CMD.GET_RUN_ID_TYPE); };
ProcyonUsbBridge.prototype.getRunID = function()             { return this._getStringParam(CMD.GET_RUN_ID); };
ProcyonUsbBridge.prototype.getDepthOut = function()          { return this._getStringParam(CMD.GET_DEPT_OUT); };
ProcyonUsbBridge.prototype.getUniqueID = function()          { return this._getStringParam(CMD.GET_UNIQUE_ID); };
ProcyonUsbBridge.prototype.getLDAP = function()              { return this._getStringParam(CMD.GET_LDAP); };
ProcyonUsbBridge.prototype.getToolType = function()          { return this._getStringParam(CMD.GET_TOOL_TYPE); };
ProcyonUsbBridge.prototype.getToolSize = function()          { return this._getStringParam(CMD.GET_TOOL_SIZE); };
ProcyonUsbBridge.prototype.getToolPosition = function()      { return this._getStringParam(CMD.GET_TOOL_POSITION); };
ProcyonUsbBridge.prototype.getToolSN = function()            { return this._getStringParam(CMD.GET_TOOL_SN); };
ProcyonUsbBridge.prototype.getConfigName = function()        { return this._getStringParam(CMD.GET_CONFIG_NAME); };
ProcyonUsbBridge.prototype.getUHConnectionType = function()  { return this._getStringParam(CMD.GET_UH_CONNECTION_TYPE); };
ProcyonUsbBridge.prototype.getDHConnectionType = function()  { return this._getStringParam(CMD.GET_DH_CONNECTION_TYPE); };
ProcyonUsbBridge.prototype.getIntPressureSN = function()     { return this._getStringParam(CMD.GET_INT_PRESSURE_SENSOR_SN); };
ProcyonUsbBridge.prototype.getExtPressureSN = function()     { return this._getStringParam(CMD.GET_EXT_PRESSURE_SENSOR_SN); };
ProcyonUsbBridge.prototype.getLimpetSN = function()          { return this._getStringParam(CMD.GET_LIMPET_SENSOR_SN); };

ProcyonUsbBridge.prototype._getStringParam = async function(commandCode) {
  try {
    var resp = await this.sendGetCommand(commandCode);
    if (resp.success) {
      return { success: true, value: resp.value || '' };
    }
    return { success: false, value: '' };
  } catch (error) {
    return { success: false, value: '', error: error.message };
  }
};

// -- SET commands --

ProcyonUsbBridge.prototype.setToolSN = function(val)            { return this.sendSetCommand(CMD.SET_TOOL_SN, val); };
ProcyonUsbBridge.prototype.setCustomer = function(val)          { return this.sendSetCommand(CMD.SET_CUSTOMER, val); };
ProcyonUsbBridge.prototype.setCountry = function(val)           { return this.sendSetCommand(CMD.SET_COUNTRY, val); };
ProcyonUsbBridge.prototype.setDistrict = function(val)          { return this.sendSetCommand(CMD.SET_DISTRICT, val); };
ProcyonUsbBridge.prototype.setRunIDType = function(val)         { return this.sendSetCommand(CMD.SET_RUN_ID_TYPE, val); };
ProcyonUsbBridge.prototype.setRunID = function(val)             { return this.sendSetCommand(CMD.SET_RUN_ID, val); };
ProcyonUsbBridge.prototype.setDepthOut = function(val)          { return this.sendSetCommand(CMD.SET_DEPT_OUT, val); };
ProcyonUsbBridge.prototype.setUniqueID = function(val)          { return this.sendSetCommand(CMD.SET_UNIQUE_ID, val); };
ProcyonUsbBridge.prototype.setLDAP = function(val)              { return this.sendSetCommand(CMD.SET_LDAP, val); };
ProcyonUsbBridge.prototype.setToolType = function(val)          { return this.sendSetCommand(CMD.SET_TOOL_TYPE, val); };
ProcyonUsbBridge.prototype.setToolPosition = function(val)      { return this.sendSetCommand(CMD.SET_TOOL_POSITION, val); };
ProcyonUsbBridge.prototype.setToolSize = function(val)          { return this.sendSetCommand(CMD.SET_TOOL_SIZE, val); };
ProcyonUsbBridge.prototype.setConfigName = function(val)        { return this.sendSetCommand(CMD.SET_CONFIG_NAME, val); };
ProcyonUsbBridge.prototype.setUHConnectionType = function(val)  { return this.sendSetCommand(CMD.SET_UH_CONNECTION_TYPE, val); };
ProcyonUsbBridge.prototype.setDHConnectionType = function(val)  { return this.sendSetCommand(CMD.SET_DH_CONNECTION_TYPE, val); };
ProcyonUsbBridge.prototype.setIntPressureSN = function(val)     { return this.sendSetCommand(CMD.SET_INT_PRESSURE_SENSOR_SN, val); };
ProcyonUsbBridge.prototype.setExtPressureSN = function(val)     { return this.sendSetCommand(CMD.SET_EXT_PRESSURE_SENSOR_SN, val); };
ProcyonUsbBridge.prototype.setLimpetSN = function(val)          { return this.sendSetCommand(CMD.SET_LIMPET_SENSOR_SN, val); };
ProcyonUsbBridge.prototype.setToolAxialPosition = function(val) { return this.sendSetCommand(CMD.SET_TOOL_AXIAL_POSITION, val); };

/**
 * Set device time -- sends 4-byte Unix timestamp (little-endian)
 * From DLL: SET_DEVICE_TIME = 68 (0x0044), data = 4-byte unix timestamp
 */
ProcyonUsbBridge.prototype.setDeviceTime = async function(dateInput) {
  try {
    if (!this.connected) {
      return { success: false, error: 'Device not connected' };
    }
    var date = dateInput ? new Date(dateInput) : new Date();
    var unixTs = Math.floor(date.getTime() / 1000);
    // 4-byte little-endian Unix timestamp
    var dataBytes = [
      unixTs & 0xFF,
      (unixTs >> 8) & 0xFF,
      (unixTs >> 16) & 0xFF,
      (unixTs >> 24) & 0xFF,
    ];
    return await this.sendCommand(CMD.SET_DEVICE_TIME, dataBytes);
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Write all SET parameters into Flash memory
 * From DLL: WriteIntoFlashAsync -> AckResponseAsync(Command.SET_PARAMETERS_INTO_FLASH)
 * SET_PARAMETERS_INTO_FLASH = 0x0100, no data payload, just check for non-null response
 */
ProcyonUsbBridge.prototype.writeIntoFlash = async function() {
  if (!this.connected) {
    return { success: false, error: 'Device not connected' };
  }
  console.log('[USB] Writing parameters into Flash...');
  var result = await this.sendAckCommand(CMD.SET_PARAMETERS_INTO_FLASH);
  if (result.success) {
    console.log('[USB] Flash write successful');
  } else {
    console.log('[USB] Flash write failed: ' + (result.error || 'unknown'));
  }
  return result;
};

/**
 * Erase used memory partitions
 * From DLL: AckResponseAsync(Command.MEMORY_ERASE_USED)
 */
ProcyonUsbBridge.prototype.eraseUsedMemory = async function() {
  if (!this.connected) {
    return { success: false, error: 'Device not connected' };
  }
  console.log('[USB] Erasing used memory...');
  return await this.sendAckCommand(CMD.MEMORY_ERASE_USED);
};

/**
 * Erase all memory partitions
 * From DLL: AckResponseAsync(Command.MEMORY_ERASE_ALL)
 */
ProcyonUsbBridge.prototype.eraseAllMemory = async function() {
  if (!this.connected) {
    return { success: false, error: 'Device not connected' };
  }
  console.log('[USB] Erasing all memory...');
  return await this.sendAckCommand(CMD.MEMORY_ERASE_ALL);
};

/**
 * Set all initialization parameters (EM variant) and write to Flash
 * Follows DLL EMSetInitParameters flow with 50ms delays
 */
ProcyonUsbBridge.prototype.setInitParameters = async function(params) {
  if (!this.connected) {
    return { success: false, error: 'Device not connected' };
  }

  var self = this;
  var results = {};

  // Order matches DLL EMSetInitParameters
  var steps = [
    ['customer',          function() { return self.setCustomer(params.customer || 'N/A'); }],
    ['country',           function() { return self.setCountry(params.country || 'N/A'); }],
    ['district',          function() { return self.setDistrict(params.district || 'N/A'); }],
    ['ldap',              function() { return self.setLDAP(params.ldap || 'N/A'); }],
    ['toolType',          function() { return self.setToolType(params.toolType || 'N/A'); }],
    ['toolPosition',      function() { return self.setToolPosition(params.toolPosition || 'N/A'); }],
    ['toolSN',            function() { return self.setToolSN(params.toolSN || 'N/A'); }],
    ['toolSize',          function() { return self.setToolSize(params.toolSize || 'N/A'); }],
    ['uhConnectionType',  function() { return self.setUHConnectionType(params.uhConnectionType || 'N/A'); }],
    ['dhConnectionType',  function() { return self.setDHConnectionType(params.dhConnectionType || 'N/A'); }],
    ['intPressureSN',     function() { return self.setIntPressureSN(params.intPressureSN || 'N/A'); }],
    ['extPressureSN',     function() { return self.setExtPressureSN(params.extPressureSN || 'N/A'); }],
    ['limpetSN',          function() { return self.setLimpetSN(params.limpetSN || 'N/A'); }],
    ['configName',        function() { return self.setConfigName(params.configName || 'N/A'); }],
    ['uniqueId',          function() { return self.setUniqueID(params.uniqueId || 'N/A'); }],
  ];

  for (var si = 0; si < steps.length; si++) {
    var name = steps[si][0];
    var fn = steps[si][1];
    try {
      var result = await fn();
      results[name] = result.success;
      console.log('[USB] SET ' + name + ': ' + (result.success ? 'OK' : 'FAIL'));
    } catch (e) {
      results[name] = false;
      console.log('[USB] SET ' + name + ': ERROR - ' + e.message);
    }
    await new Promise(function(resolve) { setTimeout(resolve, SET_DELAY_MS); });
  }

  var allSuccess = Object.values(results).every(function(v) { return v === true; });

  var flashResult = { success: false };
  if (allSuccess) {
    flashResult = await this.writeIntoFlash();
  } else {
    console.log('[USB] Not all SETs succeeded, skipping Flash write');
  }

  return {
    success: allSuccess && flashResult.success,
    results: results,
    flashResult: flashResult,
  };
};

/**
 * Get memory erase percentage
 */
ProcyonUsbBridge.prototype.getMemoryErasePercent = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_MEMORY_ERASE_PERCENT);
    if (resp.success && resp.data && resp.data.length >= 2) {
      var percent = (resp.data[1] << 8) | resp.data[0];
      return { success: true, percent: percent };
    }
    return { success: false, percent: 0 };
  } catch (error) {
    return { success: false, percent: 0, error: error.message };
  }
};

/**
 * Get number of memory partitions
 */
ProcyonUsbBridge.prototype.getMemoryPartitions = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_NUMBER_MEMORY_PARTITIONS);
    if (resp.success && resp.data && resp.data.length >= 1) {
      var count = resp.data[0];
      return { success: true, count: count };
    }
    return { success: false, count: 0 };
  } catch (error) {
    return { success: false, count: 0, error: error.message };
  }
};

/**
 * Download one-second data from device memory
 * TODO: Full implementation
 */
ProcyonUsbBridge.prototype.downloadOneSecondData = async function() {
  return { success: false, error: 'Not yet implemented', records: [] };
};

/**
 * Run self-test sequence
 * TODO: Full implementation
 */
ProcyonUsbBridge.prototype.runSelfTest = async function() {
  return { success: false, error: 'Not yet implemented', results: [] };
};

/**
 * Initialize logger configuration
 * TODO: Full implementation
 */
ProcyonUsbBridge.prototype.initializeLogger = async function() {
  return { success: false, error: 'Not yet implemented' };
};

// -- Utility functions --

/**
 * Parse IEEE 754 float from 4-byte little-endian buffer
 */
ProcyonUsbBridge.prototype._parseFloat = function(data) {
  if (!data || data.length < 4) return 0;
  var buf = Buffer.alloc(4);
  buf[0] = data[0];
  buf[1] = data[1];
  buf[2] = data[2];
  buf[3] = data[3];
  return buf.readFloatLE(0);
};

/**
 * Parse unsigned 32-bit int from 4-byte little-endian buffer
 */
ProcyonUsbBridge.prototype._parseU32 = function(data) {
  if (!data || data.length < 4) return 0;
  var buf = Buffer.alloc(4);
  for (var i = 0; i < 4; i++) buf[i] = data[i];
  return buf.readUInt32LE(0);
};

/**
 * List all USB devices (for diagnostics)
 */
ProcyonUsbBridge.prototype.listDevices = function() {
  try {
    var devices = usb.getDeviceList();
    return devices.map(function(d) {
      var desc = d.deviceDescriptor;
      var vid = desc ? desc.idVendor : 0;
      var pid = desc ? desc.idProduct : 0;
      return {
        vid: '0x' + vid.toString(16).padStart(4, '0'),
        pid: '0x' + pid.toString(16).padStart(4, '0'),
        address: d.deviceAddress,
        isProcyon: vid === PROCYON_VID && pid === PROCYON_PID,
      };
    });
  } catch (error) {
    return [];
  }
};

/**
 * Get device info
 */
ProcyonUsbBridge.prototype.getDeviceInfo = function() {
  return this.deviceInfo;
};

/**
 * Check if connected
 */
ProcyonUsbBridge.prototype.isConnected = function() {
  return this.connected;
};

/**
 * Diagnose USB connection
 */
ProcyonUsbBridge.prototype.diagnose = async function() {
  try {
    var result = {
      success: true,
      backend: 'node-usb-direct',
      totalDevices: 0,
      devices: [],
      procyonDetail: null,
    };

    try {
      var devices = usb.getDeviceList();
      result.totalDevices = devices.length;
      result.devices = devices.map(function(d) {
        var desc = d.deviceDescriptor;
        var vid = desc ? desc.idVendor : 0;
        var pid = desc ? desc.idProduct : 0;
        return {
          vid: '0x' + vid.toString(16).padStart(4, '0'),
          pid: '0x' + pid.toString(16).padStart(4, '0'),
          address: d.deviceAddress,
          isProcyon: vid === PROCYON_VID && pid === PROCYON_PID,
        };
      });

      var procyonDevice = null;
      for (var i = 0; i < devices.length; i++) {
        var d = devices[i];
        var desc = d.deviceDescriptor;
        if (desc && desc.idVendor === PROCYON_VID && desc.idProduct === PROCYON_PID) {
          procyonDevice = d;
          break;
        }
      }

      if (procyonDevice) {
        result.procyonDetail = {
          found: true,
          vid: '0x' + PROCYON_VID.toString(16),
          pid: '0x' + PROCYON_PID.toString(16),
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
};

// -- Create singleton --
var bridge = new ProcyonUsbBridge();

module.exports = {
  bridge: bridge,
  PROCYON_VID: PROCYON_VID,
  PROCYON_PID: PROCYON_PID,
  CMD: CMD,
  buildCommandPacket: buildCommandPacket,
  parseResponse: parseResponse,
};
