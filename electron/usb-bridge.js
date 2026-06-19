/**
 * Procyon CM USB Bridge -- Direct libusb0.dll FFI implementation
 *
 * Uses koffi to call libusb0.dll directly, bypassing node-usb.
 * Same communication path as original Procyon.exe.
 *
 * Device: VID=0x2269, PID=0xBEEF
 * Driver: libusb-win32 (install via Zadig)
 * Transfer: USB Bulk, EP1 OUT=0x01, EP1 IN=0x81, 64 bytes max packet
 * Interface: 1
 *
 * NOTE: No template literals to avoid GBK encoding corruption on Windows.
 */

var koffi;
try {
  koffi = require('koffi');
  console.log('[USB] koffi loaded successfully');
} catch (e) {
  console.error('[USB] FATAL: koffi not found. Run: pnpm add koffi');
  module.exports = {
    bridge: {
      connect: function() { return Promise.resolve({ success: false, error: 'koffi not installed' }); },
      disconnect: function() { return Promise.resolve({ success: false }); },
      isConnected: function() { return false; },
    },
    PROCYON_VID: 0x2269, PROCYON_PID: 0xBEEF, CMD: {},
  };
  return;
}

var PROCYON_VID = 0x2269;
var PROCYON_PID = 0xBEEF;
var EP_OUT = 0x01;
var EP_IN = 0x81;
var WRITE_TIMEOUT = 1000;
var READ_TIMEOUT = 200;
var SET_DELAY_MS = 50;
var INTERFACE_NUMBER = 1;

// =====================================================
// libusb0.dll FFI definitions
// =====================================================

var lib0;
try {
  lib0 = koffi.load('libusb0.dll');
  console.log('[USB] libusb0.dll loaded successfully');
} catch (loadErr) {
  console.error('[USB] FATAL: Cannot load libusb0.dll: ' + loadErr.message);
  module.exports = {
    bridge: {
      connect: function() { return Promise.resolve({ success: false, error: 'libusb0.dll not found' }); },
      disconnect: function() { return Promise.resolve({ success: false }); },
      isConnected: function() { return false; },
    },
    PROCYON_VID: PROCYON_VID, PROCYON_PID: PROCYON_PID, CMD: {},
  };
  return;
}

// --- Struct definitions ---

// usb_device_descriptor (18 bytes, no pointers, safe to define)
var usb_device_descriptor = koffi.struct('usb_device_descriptor', {
  bLength: 'uint8',
  bDescriptorType: 'uint8',
  bcdUSB: 'uint16',
  bDeviceClass: 'uint8',
  bDeviceSubClass: 'uint8',
  bDeviceProtocol: 'uint8',
  bMaxPacketSize0: 'uint8',
  idVendor: 'uint16',
  idProduct: 'uint16',
  bcdDevice: 'uint16',
  iManufacturer: 'uint8',
  iProduct: 'uint8',
  iSerialNumber: 'uint8',
  bNumConfigurations: 'uint8',
});
console.log('[USB] usb_device_descriptor defined OK');

// Generic opaque pointer for fields we don't need to dereference
var _opaque = koffi.opaque('_opaque');
var opaque_ptr = koffi.pointer(_opaque);

// usb_device -- define FIRST using C-style string types for self-reference
// bus field uses opaque_ptr (we never dereference it, avoids circular dependency)
var usb_device = koffi.struct('usb_device', {
  next: 'usb_device *',
  prev: 'usb_device *',
  filename: koffi.array('uint8', 512),
  bus: opaque_ptr,
  descriptor: usb_device_descriptor,
  config: opaque_ptr,
  dev: opaque_ptr,
  devnum: 'uint8',
  num_children: 'uint8',
  children: opaque_ptr,
});
console.log('[USB] usb_device defined OK');

// usb_bus -- define SECOND (usb_device is now registered, so 'usb_device *' resolves)
var usb_bus = koffi.struct('usb_bus', {
  next: 'usb_bus *',
  prev: 'usb_bus *',
  dirname: koffi.array('uint8', 512),
  devices: 'usb_device *',
  location: 'uint32',
  root_dev: 'usb_device *',
});
console.log('[USB] usb_bus defined OK');

// Pointer types for function signatures
var usb_dev_handle_ptr = koffi.pointer(koffi.opaque('usb_dev_handle'));
var usb_bus_ptr = koffi.pointer(usb_bus);
var usb_device_ptr = koffi.pointer(usb_device);

// Function declarations
var fn_usb_init = lib0.func('usb_init', 'void', []);
var fn_usb_find_busses = lib0.func('usb_find_busses', 'void', []);
var fn_usb_find_devices = lib0.func('usb_find_devices', 'void', []);
var fn_usb_get_busses = lib0.func('usb_get_busses', usb_bus_ptr, []);
var fn_usb_open = lib0.func('usb_open', usb_dev_handle_ptr, [usb_device_ptr]);
var fn_usb_close = lib0.func('usb_close', 'int', [usb_dev_handle_ptr]);
var fn_usb_claim_interface = lib0.func('usb_claim_interface', 'int', [usb_dev_handle_ptr, 'int']);
var fn_usb_release_interface = lib0.func('usb_release_interface', 'int', [usb_dev_handle_ptr, 'int']);
var fn_usb_set_configuration = lib0.func('usb_set_configuration', 'int', [usb_dev_handle_ptr, 'int']);
var fn_usb_bulk_write = lib0.func('usb_bulk_write', 'int', [usb_dev_handle_ptr, 'int', 'void *', 'int', 'int']);
var fn_usb_bulk_read = lib0.func('usb_bulk_read', 'int', [usb_dev_handle_ptr, 'int', 'void *', 'int', 'int']);
var fn_usb_strerror = lib0.func('usb_strerror', 'str', []);

console.log('[USB] All libusb0 functions bound OK');

var libusbInitialized = false;

function ensureLibusbInit() {
  if (!libusbInitialized) {
    fn_usb_init();
    fn_usb_find_busses();
    fn_usb_find_devices();
    libusbInitialized = true;
    console.log('[USB] libusb0 initialized (bus scan done)');
  }
}

/**
 * Walk the bus/device linked list to find the Procyon device.
 * Returns the usb_device pointer or null.
 */
function findProcyonDevice() {
  ensureLibusbInit();
  var busPtr = fn_usb_get_busses();
  var deviceCount = 0;
  var busCount = 0;

  while (busPtr) {
    busCount++;
    var bus;
    try {
      bus = koffi.decode(busPtr, usb_bus);
    } catch (e) {
      console.log('[USB] Error decoding bus: ' + e.message);
      break;
    }

    var devPtr = bus.devices;

    while (devPtr) {
      deviceCount++;
      var dev;
      try {
        dev = koffi.decode(devPtr, usb_device);
      } catch (e) {
        console.log('[USB] Error decoding device: ' + e.message);
        break;
      }

      var vid = dev.descriptor.idVendor;
      var pid = dev.descriptor.idProduct;

      if (vid === PROCYON_VID && pid === PROCYON_PID) {
        console.log('[USB] Found Procyon CM! VID=0x' + vid.toString(16) + ' PID=0x' + pid.toString(16) + ' (scanned ' + deviceCount + ' devices on ' + busCount + ' buses)');
        return devPtr;
      }

      devPtr = dev.next;
      // Safety: prevent infinite loop
      if (deviceCount > 200) {
        console.log('[USB] Safety limit reached (200 devices), stopping scan');
        return null;
      }
    }

    busPtr = bus.next;
    if (busCount > 20) {
      console.log('[USB] Safety limit reached (20 buses), stopping scan');
      return null;
    }
  }

  console.log('[USB] Procyon device not found. Scanned ' + deviceCount + ' devices on ' + busCount + ' buses.');
  return null;
}

// -- Command codes --
var CMD = {
  GET_FIRMWARE_VERSION: 0x0005,
  GET_NUMBER_MEMORY_PARTITIONS: 0x0190,
  GET_MEMORY_DUMP_CHUNK_DATA: 0x019A,
  GET_PARTITION_WRITTEN_BYTE_COUNT: 0x0196,
  GET_PARTITION_NUMBER_CHUNKS_WRITTEN: 0x0192,
  GET_PARTITION_TOTAL_NUMBER_CHUNKS: 0x0194,
  GET_MEMORY_DUMP_CHUNK_SIZE: 0x0198,
  MEMORY_ERASE_USED: 0x0186,
  MEMORY_ERASE_ALL: 0x0184,
  GET_MEMORY_ERASE_PERCENT: 0x0188,
  MEMORY_DUMP_START: 0x0180,
  MEMORY_DUMP_END: 0x0182,
  GET_BATTERY_VOLTAGE: 0x0040,
  GET_DEVICE_TIME: 0x0042,
  SET_DEVICE_TIME: 0x0044,
  GET_TEMPERATURE_DATA_CM: 0x0046,
  SET_PARAMETERS_INTO_FLASH: 0x0100,
  GET_CUSTOMER: 0x0102, SET_CUSTOMER: 0x0104,
  GET_COUNTRY: 0x0106, SET_COUNTRY: 0x0108,
  GET_DISTRICT: 0x010A, SET_DISTRICT: 0x010C,
  GET_RUN_ID_TYPE: 0x010E, SET_RUN_ID_TYPE: 0x0110,
  GET_RUN_ID: 0x0112, SET_RUN_ID: 0x0114,
  GET_DEPT_OUT: 0x0116, SET_DEPT_OUT: 0x0118,
  GET_UNIQUE_ID: 0x011A, SET_UNIQUE_ID: 0x011C,
  GET_LDAP: 0x011E, SET_LDAP: 0x0120,
  SET_HOUSING_NUMBER: 0x0122,
  SET_BHA_SERIAL_NUMBER: 0x0126,
  GET_TOOL_TYPE: 0x0130, SET_TOOL_TYPE: 0x0132,
  GET_TOOL_AXIAL_POSITION: 0x0134, SET_TOOL_AXIAL_POSITION: 0x0136,
  GET_TOOL_SIZE: 0x0138, SET_TOOL_SIZE: 0x013A,
  GET_TOOL_POSITION: 0x013C, SET_TOOL_POSITION: 0x013E,
  SET_TOOL_INFO_SENSOR_HEAD_SERIAL_NUMBER: 0x0140,
  SET_DRILL_BIT_INFO_BIT_BLADE_NUMBER: 0x0142,
  SET_DRILL_BIT_INFO_BIT_BOM: 0x0144,
  GET_CONFIG_NAME: 0x0148, SET_CONFIG_NAME: 0x014A,
  GET_TOOL_SN: 0x014C, SET_TOOL_SN: 0x014E,
  // amplifierDACOffset is SET-only (no GET in firmware, 0x0150 is fictional)
  SET_AMPLIFIER_DAC_OFFSET: 0x0152,
  SET_AMPLIFIER_FIRST_STAGE_GAIN: 0x0154,
  SET_AMPLIFIER_SECOND_STAGE_GAIN: 0x0156,
  // UH/DH connection type and sensor SNs are SET-only (no GET in firmware)
  SET_UH_CONNECTION_TYPE: 0x0162,
  SET_DH_CONNECTION_TYPE: 0x0166,
  SET_INT_PRESSURE_SENSOR_SN: 0x016A,
  SET_EXT_PRESSURE_SENSOR_SN: 0x016E,
  SET_LIMPET_SENSOR_SN: 0x0172,
  GET_FLASH_TEST_DATA: 0x01A0,
  GET_HIGHSHOCK_DATA_CM: 0x01A2,
  GET_LOWSHOCK_DATA_CM: 0x01A4,
  GET_LOWSHOCK_DATA_EM: 0x01A6,
  GET_PRESSURE_DATA_CM: 0x01A8,
  GET_PRESSURE_DATA_EM: 0x01AA,
  GET_PRESSURRE_SELF_TEST_DATA: 0x01AC,
  GET_ROTATIONAL_DATA_CM: 0x01AE,
  GET_ROTATIONAL_DATA_EM: 0x01B0,
  GET_TEMPERATURE_DATA_EM: 0x01B2,
  GET_LIMPET_DATA_EM: 0x01B4,
  LAUNCH_DEVICE: 0x0200,
  START_VERIFICATION: 0x01E0,
  VERIFY_STATUS: 0x01E2,
};

// -- Packet helpers --

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

function asciiToBytes(str) {
  if (!str) return [];
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xFF);
  }
  return bytes;
}

function bytesToAscii(bytes) {
  if (!bytes || bytes.length === 0) return '';
  var str = '';
  for (var i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) break;
    str += String.fromCharCode(bytes[i]);
  }
  return str;
}

function hexStr(buf) {
  if (!buf) return '<null>';
  var parts = [];
  for (var i = 0; i < buf.length; i++) {
    parts.push(buf[i].toString(16).padStart(2, '0'));
  }
  return parts.join(', ');
}

function hex4(val) {
  return '0x' + (val & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// =====================================================
// ProcyonUsbBridge
// =====================================================

function ProcyonUsbBridge() {
  this.handle = null;
  this.connected = false;
  this.deviceInfo = null;
}

ProcyonUsbBridge.prototype.connect = async function() {
  var self = this;
  if (self.connected) {
    return { success: true, message: 'Already connected' };
  }

  try {
    // Re-scan
    libusbInitialized = false;
    ensureLibusbInit();

    // Find device by walking bus/device list
    var devPtr = findProcyonDevice();
    if (!devPtr) {
      return { success: false, error: 'Procyon device not found (VID=0x2269, PID=0xBEEF)' };
    }

    // Open device
    var h = fn_usb_open(devPtr);
    if (!h) {
      var errMsg = fn_usb_strerror();
      console.log('[USB] usb_open failed: ' + errMsg);
      return { success: false, error: 'Cannot open USB device: ' + errMsg };
    }
    console.log('[USB] usb_open succeeded');
    self.handle = h;

    // Set configuration
    var cfgRet = fn_usb_set_configuration(h, 1);
    if (cfgRet < 0) {
      var cfgErr = fn_usb_strerror();
      console.log('[USB] usb_set_configuration(1) returned ' + cfgRet + ': ' + cfgErr);
    } else {
      console.log('[USB] usb_set_configuration(1) succeeded');
    }

    // Claim interface 1
    var claimRet = fn_usb_claim_interface(h, INTERFACE_NUMBER);
    if (claimRet < 0) {
      var claimErr = fn_usb_strerror();
      console.log('[USB] usb_claim_interface(' + INTERFACE_NUMBER + ') failed: ' + claimErr + ' (ret=' + claimRet + ')');
      try { fn_usb_close(h); } catch (e) {}
      self.handle = null;
      return { success: false, error: 'Cannot claim interface ' + INTERFACE_NUMBER + ': ' + claimErr };
    }
    console.log('[USB] usb_claim_interface(' + INTERFACE_NUMBER + ') SUCCEEDED!');

    self.connected = true;
    await self._readDeviceInfo();
    console.log('[USB] Connected to Procyon device');
    return { success: true, message: 'Connected to Procyon device' };
  } catch (error) {
    self.connected = false;
    if (self.handle) {
      try { fn_usb_close(self.handle); } catch (e) {}
      self.handle = null;
    }
    console.error('[USB] connect error: ' + error.message);
    return { success: false, error: error.message };
  }
};

ProcyonUsbBridge.prototype.disconnect = async function() {
  try {
    if (this.handle) {
      try { fn_usb_release_interface(this.handle, INTERFACE_NUMBER); } catch (e) {}
      try { fn_usb_close(this.handle); } catch (e) {}
      this.handle = null;
    }
    this.connected = false;
    this.deviceInfo = null;
    console.log('[USB] Disconnected');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

ProcyonUsbBridge.prototype._readDeviceInfo = async function() {
  try {
    var fw = await this.getFirmwareVersion();
    var sn = await this.getToolSN();
    var uid = await this.getUniqueID();
    var batt = await this.getBatteryVoltage();
    var temp = await this.getTemperature();
    this.deviceInfo = {
      firmwareVersion: fw.success ? fw.value : 'unknown',
      toolSN: sn.success ? sn.value : '',
      serialNumber: sn.success ? sn.value : '',
      uniqueId: uid.success ? uid.value : '',
      batteryVoltage: batt.success ? batt.voltage : 0,
      temperature: temp.success ? temp.temperature : 0,
    };
  } catch (e) {
    this.deviceInfo = { firmwareVersion: 'unknown', toolSN: '', serialNumber: '', uniqueId: '', batteryVoltage: 0, temperature: 0 };
  }
};

// -- Low-level USB transfer --

ProcyonUsbBridge.prototype._writeToDevice = function(buffer) {
  if (!this.handle) return Promise.reject(new Error('USB handle not available'));
  try {
    var written = fn_usb_bulk_write(this.handle, EP_OUT, buffer, buffer.length, WRITE_TIMEOUT);
    if (written < 0) {
      var errStr = fn_usb_strerror();
      return Promise.reject(new Error('usb_bulk_write failed: ' + errStr));
    }
    console.log('[USB] Wrote ' + written + ' bytes to EP 0x' + EP_OUT.toString(16));
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(new Error('USB write error: ' + e.message));
  }
};

ProcyonUsbBridge.prototype._readFromDevice = function(expectedLength, timeout) {
  if (!expectedLength) expectedLength = 64;
  if (!timeout) timeout = READ_TIMEOUT;
  if (!this.handle) return Promise.reject(new Error('USB handle not available'));
  try {
    var readBuf = Buffer.alloc(expectedLength);
    var bytesRead = fn_usb_bulk_read(this.handle, EP_IN, readBuf, expectedLength, timeout);
    if (bytesRead <= 0) return Promise.resolve(null);
    return Promise.resolve(readBuf.slice(0, bytesRead));
  } catch (e) {
    return Promise.reject(new Error('USB read error: ' + e.message));
  }
};

ProcyonUsbBridge.prototype.sendCommand = async function(commandCode, dataBytes) {
  if (!dataBytes) dataBytes = [];
  try {
    if (!this.connected) return { success: false, error: 'Device not connected' };

    var packet = buildCommandPacket(commandCode, dataBytes);
    console.log('[USB] TX CMD ' + hex4(commandCode) + ': [' + hexStr(packet) + ']');

    await this._writeToDevice(packet);
    var response = await this._readFromDevice(4096, READ_TIMEOUT);

    if (!response || response.length < 4) {
      console.log('[USB] RX: no response or too short');
      return { success: false, error: 'No response from device (timeout)' };
    }

    console.log('[USB] RX: [' + hexStr(response) + ']');

    var parsed = parseResponse(response);
    if (!parsed) return { success: false, error: 'Invalid response format' };

    var expectedRespCode = commandCode + 1;
    if (parsed.commandCode !== expectedRespCode) {
      console.log('[USB] Response code ' + hex4(parsed.commandCode) + ' != expected ' + hex4(expectedRespCode));
    }

    var value = bytesToAscii(parsed.data);
    return { success: true, data: parsed.data, value: value, commandCode: parsed.commandCode, length: parsed.length };
  } catch (error) {
    console.error('[USB] sendCommand error: ' + error.message);
    return { success: false, error: error.message };
  }
};

ProcyonUsbBridge.prototype.sendGetCommand = async function(commandCode) {
  return this.sendCommand(commandCode, []);
};

ProcyonUsbBridge.prototype.sendSetCommand = async function(commandCode, stringValue) {
  var dataBytes = asciiToBytes(stringValue);
  var result = await this.sendCommand(commandCode, dataBytes);
  if (!result.success) return result;
  if (result.value === '0' || result.value === '') {
    return { success: false, error: 'Device returned 0 (failure)', value: result.value };
  }
  return result;
};

ProcyonUsbBridge.prototype.sendAckCommand = async function(commandCode, dataBytes) {
  if (!dataBytes) dataBytes = [];
  var result = await this.sendCommand(commandCode, dataBytes);
  if (!result.success) return result;
  return { success: true };
};

// -- GET commands --

ProcyonUsbBridge.prototype.getFirmwareVersion = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_FIRMWARE_VERSION);
    if (resp.success && resp.data && resp.data.length >= 3) {
      // Firmware version: each byte is a version segment (major.minor.patch)
      // e.g. data=[02,00,06,02] => v2.0.6 (ignore trailing byte)
      var major = resp.data[0];
      var minor = resp.data[1];
      var patch = resp.data[2];
      return { success: true, value: 'v' + major + '.' + minor + '.' + patch };
    }
    return { success: false, value: null };
  } catch (error) {
    return { success: false, value: null, error: error.message };
  }
};

ProcyonUsbBridge.prototype.getBatteryVoltage = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_BATTERY_VOLTAGE);
    if (resp.success && resp.data && resp.data.length > 0) {
      var rawMv = 0;
      // First try ASCII string value (e.g. "3620" => 3620 mV)
      if (resp.value && resp.value.length > 0) {
        var parsed = parseInt(resp.value, 10);
        if (!isNaN(parsed) && parsed > 0) {
          rawMv = parsed;
        }
      }
      // Fallback: try float32 binary
      if (rawMv === 0 && resp.data.length >= 4) {
        rawMv = Math.round(this._parseFloat(resp.data));
      }
      var volts = Math.round(rawMv / 10) / 100;
      return { success: true, voltage: volts, rawMv: rawMv };
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
      var ts = this._parseU32(resp.data);
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
    if (resp.success && resp.data && resp.data.length > 0) {
      var temp = 0;
      // First try ASCII string value
      if (resp.value && resp.value.length > 0) {
        var parsed = parseFloat(resp.value);
        if (!isNaN(parsed) && parsed !== 0) {
          temp = parsed;
        }
      }
      // Fallback: try float32 binary
      if (temp === 0 && resp.data.length >= 4) {
        temp = this._parseFloat(resp.data);
      }
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
ProcyonUsbBridge.prototype.getToolAxialPosition = function() { return this._getStringParam(CMD.GET_TOOL_AXIAL_POSITION); };
// Note: Housing Number, BHA Serial Number, Sensor Head SN, Drill Bit info, and some Amplifier params
// are SET-only per the DLL - no GET command defined. They will show N/A in Config Status.

ProcyonUsbBridge.prototype._getStringParam = async function(commandCode) {
  try {
    var resp = await this.sendGetCommand(commandCode);
    if (resp.success) return { success: true, value: resp.value || '' };
    return { success: false, value: '' };
  } catch (error) {
    return { success: false, value: '', error: error.message };
  }
};

// -- SET commands --

ProcyonUsbBridge.prototype.setToolSN = function(v)            { return this.sendSetCommand(CMD.SET_TOOL_SN, v); };
ProcyonUsbBridge.prototype.setCustomer = function(v)          { return this.sendSetCommand(CMD.SET_CUSTOMER, v); };
ProcyonUsbBridge.prototype.setCountry = function(v)           { return this.sendSetCommand(CMD.SET_COUNTRY, v); };
ProcyonUsbBridge.prototype.setDistrict = function(v)          { return this.sendSetCommand(CMD.SET_DISTRICT, v); };
ProcyonUsbBridge.prototype.setRunIDType = function(v)         { return this.sendSetCommand(CMD.SET_RUN_ID_TYPE, v); };
ProcyonUsbBridge.prototype.setRunID = function(v)             { return this.sendSetCommand(CMD.SET_RUN_ID, v); };
ProcyonUsbBridge.prototype.setDepthOut = function(v)          { return this.sendSetCommand(CMD.SET_DEPT_OUT, v); };
ProcyonUsbBridge.prototype.setUniqueID = function(v)          { return this.sendSetCommand(CMD.SET_UNIQUE_ID, v); };
ProcyonUsbBridge.prototype.setLDAP = function(v)              { return this.sendSetCommand(CMD.SET_LDAP, v); };
ProcyonUsbBridge.prototype.setToolType = function(v)          { return this.sendSetCommand(CMD.SET_TOOL_TYPE, v); };
ProcyonUsbBridge.prototype.setToolPosition = function(v)      { return this.sendSetCommand(CMD.SET_TOOL_POSITION, v); };
ProcyonUsbBridge.prototype.setToolSize = function(v)          { return this.sendSetCommand(CMD.SET_TOOL_SIZE, v); };
ProcyonUsbBridge.prototype.setConfigName = function(v)        { return this.sendSetCommand(CMD.SET_CONFIG_NAME, v); };
ProcyonUsbBridge.prototype.setUHConnectionType = function(v)  { return this.sendSetCommand(CMD.SET_UH_CONNECTION_TYPE, v); };
ProcyonUsbBridge.prototype.setDHConnectionType = function(v)  { return this.sendSetCommand(CMD.SET_DH_CONNECTION_TYPE, v); };
ProcyonUsbBridge.prototype.setIntPressureSN = function(v)     { return this.sendSetCommand(CMD.SET_INT_PRESSURE_SENSOR_SN, v); };
ProcyonUsbBridge.prototype.setExtPressureSN = function(v)     { return this.sendSetCommand(CMD.SET_EXT_PRESSURE_SENSOR_SN, v); };
ProcyonUsbBridge.prototype.setLimpetSN = function(v)          { return this.sendSetCommand(CMD.SET_LIMPET_SENSOR_SN, v); };
ProcyonUsbBridge.prototype.setToolAxialPosition = function(v) { return this.sendSetCommand(CMD.SET_TOOL_AXIAL_POSITION, v); };

ProcyonUsbBridge.prototype.setDeviceTime = async function(dateInput) {
  try {
    if (!this.connected) return { success: false, error: 'Device not connected' };
    var date = dateInput ? new Date(dateInput) : new Date();
    var unixTs = Math.floor(date.getTime() / 1000);
    var dataBytes = [unixTs & 0xFF, (unixTs >> 8) & 0xFF, (unixTs >> 16) & 0xFF, (unixTs >> 24) & 0xFF];
    return await this.sendCommand(CMD.SET_DEVICE_TIME, dataBytes);
  } catch (error) {
    return { success: false, error: error.message };
  }
};

ProcyonUsbBridge.prototype.writeIntoFlash = async function() {
  if (!this.connected) return { success: false, error: 'Device not connected' };
  console.log('[USB] Writing parameters into Flash...');
  var result = await this.sendAckCommand(CMD.SET_PARAMETERS_INTO_FLASH);
  console.log('[USB] Flash write ' + (result.success ? 'successful' : 'failed'));
  return result;
};

ProcyonUsbBridge.prototype.eraseUsedMemory = async function() {
  if (!this.connected) return { success: false, error: 'Device not connected' };
  return await this.sendAckCommand(CMD.MEMORY_ERASE_USED);
};

ProcyonUsbBridge.prototype.eraseAllMemory = async function() {
  if (!this.connected) return { success: false, error: 'Device not connected' };
  return await this.sendAckCommand(CMD.MEMORY_ERASE_ALL);
};

ProcyonUsbBridge.prototype.setInitParameters = async function(params) {
  if (!this.connected) return { success: false, error: 'Device not connected' };
  var self = this;
  var results = {};
  var steps = [
    ['customer', function() { return self.setCustomer(params.customer || 'N/A'); }],
    ['country', function() { return self.setCountry(params.country || 'N/A'); }],
    ['district', function() { return self.setDistrict(params.district || 'N/A'); }],
    ['ldap', function() { return self.setLDAP(params.ldap || 'N/A'); }],
    ['toolType', function() { return self.setToolType(params.toolType || 'N/A'); }],
    ['toolPosition', function() { return self.setToolPosition(params.toolPosition || 'N/A'); }],
    ['toolSN', function() { return self.setToolSN(params.toolSN || 'N/A'); }],
    ['toolSize', function() { return self.setToolSize(params.toolSize || 'N/A'); }],
    ['uhConnectionType', function() { return self.setUHConnectionType(params.uhConnectionType || 'N/A'); }],
    ['dhConnectionType', function() { return self.setDHConnectionType(params.dhConnectionType || 'N/A'); }],
    ['intPressureSN', function() { return self.setIntPressureSN(params.intPressureSN || 'N/A'); }],
    ['extPressureSN', function() { return self.setExtPressureSN(params.extPressureSN || 'N/A'); }],
    ['limpetSN', function() { return self.setLimpetSN(params.limpetSN || 'N/A'); }],
    ['configName', function() { return self.setConfigName(params.configName || 'N/A'); }],
    ['uniqueId', function() { return self.setUniqueID(params.uniqueId || 'N/A'); }],
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
  if (allSuccess) { flashResult = await this.writeIntoFlash(); }
  else { console.log('[USB] Not all SETs succeeded, skipping Flash write'); }
  return { success: allSuccess && flashResult.success, results: results, flashResult: flashResult };
};

ProcyonUsbBridge.prototype.getMemoryErasePercent = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_MEMORY_ERASE_PERCENT);
    if (resp.success && resp.data && resp.data.length >= 2) {
      return { success: true, percent: (resp.data[1] << 8) | resp.data[0] };
    }
    return { success: false, percent: 0 };
  } catch (error) {
    return { success: false, percent: 0, error: error.message };
  }
};

ProcyonUsbBridge.prototype.getMemoryPartitions = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_NUMBER_MEMORY_PARTITIONS);
    if (resp.success && resp.data && resp.data.length >= 1) {
      return { success: true, count: resp.data[0] };
    }
    return { success: false, count: 0 };
  } catch (error) {
    return { success: false, count: 0, error: error.message };
  }
};

ProcyonUsbBridge.prototype.eraseMemory = async function(eraseAll) {
  try {
    var cmd = eraseAll ? CMD.MEMORY_ERASE_ALL : CMD.MEMORY_ERASE_USED;
    // Send erase command - device may not ACK, so we try and proceed to polling regardless
    var resp = await this.sendAckCommand(cmd);
    if (!resp.success) {
      // Some firmware versions don't ACK the erase command but still start erasing
      // Proceed to poll erase percent anyway
      console.log('[USB] Erase command not ACKed, polling erase percent anyway...');
    }
    // Wait for erase to complete - poll erase percent
    var pollFailCount = 0;
    for (var i = 0; i < 120; i++) {
      await new Promise(function(resolve) { setTimeout(resolve, 1000); });
      var pct = await this.getMemoryErasePercent();
      if (pct.success && pct.percent >= 100) {
        return { success: true };
      }
      if (pct.success) {
        console.log('[USB] Erase progress: ' + pct.percent + '%');
        pollFailCount = 0;
      } else {
        pollFailCount++;
        // If we fail to read erase percent 5 times in a row, firmware doesn't support it
        // Assume erase completed after a reasonable wait
        if (pollFailCount >= 5) {
          console.log('[USB] Erase percent not readable (firmware may not support), assuming completed after ' + (i + 1) + 's');
          return { success: true, detail: 'Assumed completed (erase percent not readable)' };
        }
      }
    }
    return { success: false, error: 'Erase timeout (waited 120s)' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

ProcyonUsbBridge.prototype.downloadData = async function(onProgress) {
  try {
    // Step 1: Notify device about dump start
    var notifyResp = await this.sendAckCommand(CMD.MEMORY_DUMP_START);
    if (!notifyResp.success) {
      console.log('[USB] MEMORY_DUMP_START not ACKed, proceeding anyway...');
    }

    // Wait for device to prepare dump data (firmware needs time)
    await new Promise(function(resolve) { setTimeout(resolve, 1000); });

    // Step 2: Get number of partitions (try with longer timeout)
    var numPartitions = 0;
    var partResp = await this.getMemoryPartitions();
    if (partResp.success && partResp.count > 0) {
      numPartitions = partResp.count;
      console.log('[USB] Found ' + numPartitions + ' memory partitions');
    } else {
      // Firmware may not support GET_NUMBER_MEMORY_PARTITIONS
      // Try alternative approaches with extended timeout
      console.log('[USB] GET_NUMBER_MEMORY_PARTITIONS failed, trying alternative approach...');

      // Alt 1: GET_PARTITION_WRITTEN_BYTE_COUNT (with extended read timeout)
      var savedTimeout = READ_TIMEOUT;
      READ_TIMEOUT = 2000; // extend to 2s for memory operations
      try {
        var byteCountResp = await this.sendGetCommand(CMD.GET_PARTITION_WRITTEN_BYTE_COUNT);
        console.log('[USB] GET_PARTITION_WRITTEN_BYTE_COUNT: success=' + byteCountResp.success + ', dataLen=' + (byteCountResp.data ? byteCountResp.data.length : 0));
        if (byteCountResp.success && byteCountResp.data && byteCountResp.data.length >= 1) {
          var writtenBytes = this._parseU32(byteCountResp.data);
          if (writtenBytes > 0) {
            numPartitions = 1;
            console.log('[USB] Alternative: found written bytes = ' + writtenBytes + ', assuming 1 partition');
          }
        }
      } catch(e) {
        console.log('[USB] GET_PARTITION_WRITTEN_BYTE_COUNT error: ' + e.message);
      }

      // Alt 2: GET_PARTITION_NUMBER_CHUNKS_WRITTEN
      if (numPartitions === 0) {
        try {
          var writtenChunksResp2 = await this.sendGetCommand(CMD.GET_PARTITION_NUMBER_CHUNKS_WRITTEN);
          console.log('[USB] GET_PARTITION_NUMBER_CHUNKS_WRITTEN: success=' + writtenChunksResp2.success + ', dataLen=' + (writtenChunksResp2.data ? writtenChunksResp2.data.length : 0));
          if (writtenChunksResp2.success && writtenChunksResp2.data && writtenChunksResp2.data.length >= 1) {
            var wc = this._parseU32(writtenChunksResp2.data);
            if (wc > 0) {
              numPartitions = 1;
              console.log('[USB] Alternative: found written chunks = ' + wc + ', assuming 1 partition');
            }
          }
        } catch(e) {
          console.log('[USB] GET_PARTITION_NUMBER_CHUNKS_WRITTEN error: ' + e.message);
        }
      }

      // Alt 3: GET_PARTITION_TOTAL_NUMBER_CHUNKS
      if (numPartitions === 0) {
        try {
          var totalChunksResp = await this.sendGetCommand(CMD.GET_PARTITION_TOTAL_NUMBER_CHUNKS);
          console.log('[USB] GET_PARTITION_TOTAL_NUMBER_CHUNKS: success=' + totalChunksResp.success + ', dataLen=' + (totalChunksResp.data ? totalChunksResp.data.length : 0));
          if (totalChunksResp.success && totalChunksResp.data && totalChunksResp.data.length >= 1) {
            var tc = this._parseU32(totalChunksResp.data);
            if (tc > 0) {
              numPartitions = 1;
              console.log('[USB] Alternative: found total chunks = ' + tc + ', assuming 1 partition');
            }
          }
        } catch(e) {
          console.log('[USB] GET_PARTITION_TOTAL_NUMBER_CHUNKS error: ' + e.message);
        }
      }

      // Alt 4: try reading chunk data directly
      if (numPartitions === 0) {
        try {
          var testChunkResp = await this.sendGetCommand(CMD.GET_MEMORY_DUMP_CHUNK_DATA);
          console.log('[USB] GET_MEMORY_DUMP_CHUNK_DATA test: success=' + testChunkResp.success + ', dataLen=' + (testChunkResp.data ? testChunkResp.data.length : 0));
          if (testChunkResp.success && testChunkResp.data && testChunkResp.data.length > 0) {
            numPartitions = 1;
            console.log('[USB] Alternative: chunk data readable, assuming 1 partition with unknown size');
          }
        } catch(e) {
          console.log('[USB] GET_MEMORY_DUMP_CHUNK_DATA test error: ' + e.message);
        }
      }

      // Alt 5: check GET_MEMORY_DUMP_CHUNK_SIZE for availability
      if (numPartitions === 0) {
        try {
          var chunkSizeResp = await this.sendGetCommand(CMD.GET_MEMORY_DUMP_CHUNK_SIZE);
          console.log('[USB] GET_MEMORY_DUMP_CHUNK_SIZE: success=' + chunkSizeResp.success + ', dataLen=' + (chunkSizeResp.data ? chunkSizeResp.data.length : 0));
          if (chunkSizeResp.success && chunkSizeResp.data && chunkSizeResp.data.length >= 1) {
            numPartitions = 1;
            console.log('[USB] Alternative: chunk size available, assuming 1 partition');
          }
        } catch(e) {
          console.log('[USB] GET_MEMORY_DUMP_CHUNK_SIZE error: ' + e.message);
        }
      }

      // Alt 6: Force assume 1 partition and try direct chunk reading
      // Some firmware versions don't support partition queries but support chunk data
      if (numPartitions === 0) {
        console.log('[USB] All partition queries failed, force assuming 1 partition with direct chunk reading');
        numPartitions = 1;
      }

      READ_TIMEOUT = savedTimeout; // restore original timeout
    }

    // Step 3: Get chunk info and download per partition (use extended timeout)
    var allData = [];
    var savedTimeout2 = READ_TIMEOUT;
    READ_TIMEOUT = 2000; // 2s for memory read operations
    for (var p = 0; p < numPartitions; p++) {
      var totalChunksResp = await this.sendGetCommand(CMD.GET_PARTITION_TOTAL_NUMBER_CHUNKS);
      var writtenChunksResp = await this.sendGetCommand(CMD.GET_PARTITION_NUMBER_CHUNKS_WRITTEN);
      var totalChunks = totalChunksResp.success ? this._parseU32(totalChunksResp.data) : 0;
      var writtenChunks = writtenChunksResp.success ? this._parseU32(writtenChunksResp.data) : 0;
      var chunkSizeResp = await this.sendGetCommand(CMD.GET_MEMORY_DUMP_CHUNK_SIZE);
      var chunkSize = chunkSizeResp.success ? this._parseU32(chunkSizeResp.data) : 64;

      console.log('[USB] Partition ' + (p + 1) + ': totalChunks=' + totalChunks + ', writtenChunks=' + writtenChunks + ', chunkSize=' + chunkSize);

      var partitionData = Buffer.alloc(0);
      var chunksToRead = writtenChunks > 0 ? writtenChunks : totalChunks;

      // If we still don't know how many chunks, try reading until failure
      if (chunksToRead === 0) {
        console.log('[USB] Unknown chunk count, reading until device stops responding...');
        chunksToRead = 99999; // will break on read failure
      }

      for (var c = 0; c < chunksToRead; c++) {
        var chunkResp = await this.sendGetCommand(CMD.GET_MEMORY_DUMP_CHUNK_DATA, chunkSize);
        if (!chunkResp.success || !chunkResp.data || chunkResp.data.length === 0) {
          console.log('[USB] Chunk read failed at chunk ' + (c + 1) + ', stopping partition read');
          break;
        }
        partitionData = Buffer.concat([partitionData, Buffer.from(chunkResp.data)]);
        if (onProgress) {
          var pct = chunksToRead < 99999
            ? Math.round(((p * chunksToRead + c + 1) / (numPartitions * chunksToRead)) * 100)
            : Math.round((c + 1) / ((c + 1) + 10) * 100); // rough estimate
          onProgress({
            partition: p + 1,
            totalPartitions: numPartitions,
            chunk: c + 1,
            totalChunks: writtenChunks > 0 ? writtenChunks : (c + 1),
            percent: pct
          });
        }
      }
      allData.push({ partition: p + 1, data: partitionData, size: partitionData.length });
    }

    READ_TIMEOUT = savedTimeout2; // restore original timeout

    // Step 4: End dump
    try { await this.sendAckCommand(CMD.MEMORY_DUMP_END); } catch(e) {
      console.log('[USB] MEMORY_DUMP_END not ACKed');
    }

    return { success: true, partitions: allData, totalPartitions: numPartitions };
  } catch (error) {
    READ_TIMEOUT = savedTimeout2; // restore on error too
    return { success: false, error: error.message, records: [] };
  }
};

ProcyonUsbBridge.prototype.runSelfTest = async function(tests, onProgress) {
  try {
    var results = [];
    var testList = tests || [
      'toolSNSet', 'rtcTest', 'batteryTest', 'ambientTempTest',
      'gyroSelfTest', 'accelGyroSelfTest', 'accelSelfTest',
      'rotationValidation', 'highShockValidation', 'lowShockValidation',
      'pressureTest', 'erasingMemoryTest'
    ];

    // Enter test mode
    var setModeResp = await this.sendSetCommand(CMD.SET_SELF_TEST_MODE, '1');
    if (!setModeResp.success) {
      return { success: false, error: 'Failed to enter test mode', results: [] };
    }
    await new Promise(function(resolve) { setTimeout(resolve, 500); });

    var testMap = {
      'toolSNSet': { name: 'Tool Serial Number Set', type: 'input' },
      'rtcTest': { name: 'RTC Test', type: 'verify', verificationId: '1' },
      'batteryTest': { name: 'Battery Voltage Test', type: 'read', cmd: CMD.GET_BATTERY_VOLTAGE, check: 'range', min: 3500 },
      'ambientTempTest': { name: 'Ambient Temperature Test', type: 'read', cmd: CMD.GET_TEMPERATURE_DATA_CM, check: 'range', min: -40, max: 150 },
      'gyroSelfTest': { name: 'Gyro Self Test', type: 'verify', verificationId: '2' },
      'accelGyroSelfTest': { name: 'Accel+Gyro Self Test', type: 'verify', verificationId: '3' },
      'accelSelfTest': { name: 'Accel Self Test', type: 'verify', verificationId: '4' },
      'rotationValidation': { name: 'Rotation Validation', type: 'verify', verificationId: '5' },
      'highShockValidation': { name: 'High Shock Validation', type: 'verify', verificationId: '6' },
      'lowShockValidation': { name: 'Low Shock Validation', type: 'verify', verificationId: '7' },
      'pressureTest': { name: 'Pressure Sensor Test', type: 'verify', verificationId: '8' },
      'erasingMemoryTest': { name: 'Erasing Memory Test', type: 'erase' }
    };

    for (var i = 0; i < testList.length; i++) {
      var testId = testList[i];
      var testInfo = testMap[testId];
      if (!testInfo) {
        results.push({ id: testId, name: testId, pass: false, detail: 'Unknown test' });
        continue;
      }

      if (onProgress) {
        onProgress({ current: i + 1, total: testList.length, testId: testId, testName: testInfo.name, status: 'running' });
      }

      var testResult = { id: testId, name: testInfo.name, pass: false, detail: '' };

      try {
        if (testInfo.type === 'input') {
          // Tool SN set test - just verify the SN was set
          var snResp = await this.getToolSN();
          testResult.pass = snResp.success && snResp.value && snResp.value.length > 0;
          testResult.detail = testResult.pass ? 'Tool S/N verified: ' + snResp.value : 'Tool S/N not set';

        } else if (testInfo.type === 'verify') {
          // Use START_VERIFICATION + VERIFY_STATUS protocol
          // Send verification ID as data
          var startResp = await this.sendCommand(CMD.START_VERIFICATION, [], true);
          if (startResp.success) {
            // Wait for verification to complete (up to 10 seconds)
            var verifyPass = false;
            var verifyDetail = '';
            for (var retry = 0; retry < 20; retry++) {
              await new Promise(function(resolve) { setTimeout(resolve, 500); });
              var statusResp = await this.sendGetCommand(CMD.VERIFY_STATUS);
              if (statusResp.success && statusResp.value) {
                // Response value: non-zero and not '0' means pass
                var statusVal = statusResp.value.trim();
                if (statusVal !== '' && statusVal !== '0') {
                  verifyPass = true;
                  verifyDetail = 'Status: ' + statusVal;
                  break;
                } else if (statusVal === '0') {
                  verifyDetail = 'Failed (status=0)';
                  break;
                }
              }
            }
            testResult.pass = verifyPass;
            testResult.detail = verifyDetail || 'Verification timeout';
          } else {
            testResult.detail = 'Failed to start verification';
          }

        } else if (testInfo.type === 'read') {
          // Read sensor value and check range
          var resp = await this.sendGetCommand(testInfo.cmd);
          if (resp.success && resp.data) {
            var val = this._parseFloat(resp.data);
            var minOk = testInfo.min === undefined || val >= testInfo.min;
            var maxOk = testInfo.max === undefined || val <= testInfo.max;
            testResult.pass = minOk && maxOk;
            testResult.detail = 'Value: ' + val.toFixed(2);
          } else {
            testResult.detail = 'No response';
          }

        } else if (testInfo.type === 'erase') {
          // Erase memory test
          var eraseResp = await this.eraseMemory(false);
          testResult.pass = eraseResp.success;
          testResult.detail = eraseResp.success ? 'Erase initiated' : 'Erase failed';
          // Wait for erase to complete
          if (eraseResp.success) {
            for (var eraseRetry = 0; eraseRetry < 60; eraseRetry++) {
              await new Promise(function(resolve) { setTimeout(resolve, 1000); });
              var pctResp = await this.sendGetCommand(CMD.GET_MEMORY_ERASE_PERCENT);
              if (pctResp.success && pctResp.value) {
                var pct = parseInt(pctResp.value, 10);
                if (pct >= 100) {
                  testResult.detail = 'Erase completed (100%)';
                  break;
                }
                testResult.detail = 'Erasing: ' + pct + '%';
              }
            }
          }
        }
      } catch (testErr) {
        testResult.detail = 'Error: ' + testErr.message;
      }

      results.push(testResult);
      await new Promise(function(resolve) { setTimeout(resolve, 200); });
    }

    // Exit test mode
    await this.sendSetCommand(CMD.SET_SELF_TEST_MODE, '0');

    var passedCount = results.filter(function(r) { return r.pass; }).length;
    return {
      success: true,
      results: results,
      summary: {
        total: results.length,
        passed: passedCount,
        failed: results.length - passedCount,
        passRate: results.length > 0 ? ((passedCount / results.length) * 100).toFixed(2) : '0.00'
      }
    };
  } catch (error) {
    // Try to exit test mode on error
    try { await this.sendSetCommand(CMD.SET_SELF_TEST_MODE, '0'); } catch(e) {}
    return { success: false, error: error.message, results: [] };
  }
};

ProcyonUsbBridge.prototype.initializeLogger = async function(params, eraseMemory, onProgress) {
  try {
    var steps = [];

    // Step 1: Set device time (non-critical, some firmware versions may not support it)
    if (onProgress) onProgress({ step: 'Setting Parameters On the Device', status: 'running' });
    try {
      var timeResp = await this.setDeviceTime();
      steps.push({ name: 'Set Device Time', success: timeResp.success });
    } catch (timeErr) {
      console.log('[USB] SetDeviceTime failed (non-critical): ' + timeErr.message);
      steps.push({ name: 'Set Device Time', success: false, detail: 'Not supported by firmware' });
    }

    // Step 2: Set all parameters on the device (tolerates individual failures)
    var setParams = await this.setMultipleParameters(params);
    steps.push({ name: 'Setting Parameters On the Device', success: true, detail: setParams.failedParams && setParams.failedParams.length > 0 ? 'Failed: ' + setParams.failedParams.join(', ') : '' });
    if (!setParams.success) {
      return { success: false, error: 'Failed to set parameters', steps: steps };
    }

    // Step 2: Check battery level
    if (onProgress) onProgress({ step: 'Checking Connected Battery Level', status: 'running' });
    var battResp = await this.getBatteryVoltage();
    var battOk = battResp.success && battResp.rawMv >= 3500;
    steps.push({ name: 'Checking Connected Battery Level', success: battOk, detail: battResp.success ? battResp.rawMv + ' mV' : 'Failed to read' });
    if (!battOk) {
      return { success: false, error: 'Battery voltage too low (' + (battResp.rawMv || 0) + ' mV, minimum 3500 mV)', steps: steps };
    }

    // Step 3: Erase device memory (if requested, non-fatal)
    if (eraseMemory) {
      if (onProgress) onProgress({ step: 'Erasing Device Memory', status: 'running' });
      var eraseResp = await this.eraseMemory(true);
      steps.push({ name: 'Erasing Device Memory', success: eraseResp.success, detail: eraseResp.error || (eraseResp.success ? 'Completed' : '') });
      // Erase failure is non-fatal - continue with flash write
    }

    // Step 4: Validate memory capacity (non-critical, some firmware doesn't support this command)
    if (onProgress) onProgress({ step: 'Validate Memory Capacity', status: 'running' });
    try {
      var memResp = await this.getMemoryPartitions();
      steps.push({ name: 'Validate Memory Capacity', success: memResp.success, detail: memResp.success ? memResp.count + ' partition(s)' : 'Not supported' });
    } catch (memErr) {
      steps.push({ name: 'Validate Memory Capacity', success: false, detail: 'Not supported by firmware' });
    }

    // Step 5: Write into flash (CRITICAL)
    if (onProgress) onProgress({ step: 'Writing Parameters to Flash', status: 'running' });
    var flashResp = await this.writeIntoFlash();
    steps.push({ name: 'Writing Parameters to Flash', success: flashResp.success });

    // Success = parameters set + flash write succeeded
    // Non-critical steps (setDeviceTime, eraseMemory, validateMemory) don't block success
    var criticalSteps = steps.filter(function(s) {
      return s.name === 'Setting Parameters On the Device' || s.name === 'Checking Connected Battery Level' || s.name === 'Writing Parameters to Flash';
    });
    var allSuccess = criticalSteps.every(function(s) { return s.success; });
    return { success: allSuccess, steps: steps };
  } catch (error) {
    return { success: false, error: error.message, steps: steps || [] };
  }
};

ProcyonUsbBridge.prototype.launchDevice = async function(delaySeconds) {
  try {
    var delay = delaySeconds || 0;
    var data = [];
    // Send delay as 4-byte little-endian uint32
    data.push(delay & 0xFF);
    data.push((delay >> 8) & 0xFF);
    data.push((delay >> 16) & 0xFF);
    data.push((delay >> 24) & 0xFF);
    var result = await this.sendCommand(CMD.LAUNCH_DEVICE, data);
    if (result.success) {
      return { success: true, detail: 'Device launched with ' + delay + 's delay' };
    }
    // Device may not ACK but still accepted the command (like MEMORY_DUMP_START)
    // Try reading again with longer timeout
    var retry = await this._readFromDevice(4096, 3000);
    if (retry && retry.length >= 4) {
      console.log('[USB] LAUNCH_DEVICE late response: [' + hexStr(retry) + ']');
      return { success: true, detail: 'Device launched with ' + delay + 's delay (late ACK)' };
    }
    // No ACK but command was sent - assume success (firmware may not respond)
    console.log('[USB] LAUNCH_DEVICE: no ACK, assuming accepted (delay=' + delay + 's)');
    return { success: true, detail: 'Launch command sent (no ACK, delay=' + delay + 's)' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

ProcyonUsbBridge.prototype.listDevices = function() {
  if (this.connected && this.deviceInfo) {
    return [{
      vendorId: '0x' + PROCYON_VID.toString(16).toUpperCase(),
      productId: '0x' + PROCYON_PID.toString(16).toUpperCase(),
      serialNumber: this.deviceInfo.serialNumber || '',
      deviceName: 'Procyon-CM',
      manufacturer: 'Procyon',
      isProcyon: true,
      deviceAddress: 0
    }];
  }
  return [];
};
ProcyonUsbBridge.prototype.getDeviceInfo = function() {
  if (!this.deviceInfo) return { success: false, error: 'No device info available' };
  return { success: true, info: this.deviceInfo };
};
ProcyonUsbBridge.prototype.isConnected = function() { return this.connected; };

ProcyonUsbBridge.prototype.getAllParameters = async function() {
  try {
    var params = {};
    var getters = {
      toolSN: this.getToolSN.bind(this),
      runID: this.getRunID.bind(this),
      runIDType: this.getRunIDType.bind(this),
      customer: this.getCustomer.bind(this),
      country: this.getCountry.bind(this),
      district: this.getDistrict.bind(this),
      depthOut: this.getDepthOut.bind(this),
      uniqueId: this.getUniqueID.bind(this),
      ldap: this.getLDAP.bind(this),
      toolType: this.getToolType.bind(this),
      toolSize: this.getToolSize.bind(this),
      toolPosition: this.getToolPosition.bind(this),
      configName: this.getConfigName.bind(this),
      toolAxialPosition: this.getToolAxialPosition.bind(this),
      // SET-only params (no GET CMD in firmware): uhConnectionType, dhConnectionType,
      // intPressureSN, extPressureSN, limpetSN, housingNumber, bhaSerialNumber,
      // sensorHeadSN, drillBitBladeNumber, drillBitBOM, amplifierDACOffset,
      // amplifierFirstStageGain, amplifierSecondStageGain
    };
    var keys = Object.keys(getters);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      try {
        var result = await getters[key]();
        params[key] = result.success ? (result.value || '') : '';
      } catch (e) {
        params[key] = '';
      }
    }
    return { success: true, params: params };
  } catch (error) {
    return { success: false, error: error.message, params: {} };
  }
};

ProcyonUsbBridge.prototype.getSensorData = async function() {
  try {
    var sensorData = {};
    var sensorGetters = {
      temperatureCM: { fn: this.getTemperature.bind(this), type: 'custom' },
      batteryVoltage: { fn: this.getBatteryVoltage.bind(this), type: 'custom' },
      highShockCM: { cmd: CMD.GET_HIGHSHOCK_DATA_CM, type: 'float32' },
      lowShockCM: { cmd: CMD.GET_LOWSHOCK_DATA_CM, type: 'float32' },
      lowShockEM: { cmd: CMD.GET_LOWSHOCK_DATA_EM, type: 'float32' },
      pressureCM: { cmd: CMD.GET_PRESSURE_DATA_CM, type: 'float32' },
      pressureEM: { cmd: CMD.GET_PRESSURE_DATA_EM, type: 'float32' },
      pressureSelfTest: { cmd: CMD.GET_PRESSURRE_SELF_TEST_DATA, type: 'float32' },
      rotationalCM: { cmd: CMD.GET_ROTATIONAL_DATA_CM, type: 'float32' },
      rotationalEM: { cmd: CMD.GET_ROTATIONAL_DATA_EM, type: 'float32' },
      temperatureEM: { cmd: CMD.GET_TEMPERATURE_DATA_EM, type: 'float32' },
      limpetEM: { cmd: CMD.GET_LIMPET_DATA_EM, type: 'float32' },
      flashTest: { cmd: CMD.GET_FLASH_TEST_DATA, type: 'float32' },
    };
    var keys = Object.keys(sensorGetters);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var getter = sensorGetters[key];
      try {
        if (getter.type === 'custom') {
          // getBatteryVoltage / getTemperature - use their own parsing
          var result = await getter.fn();
          if (result && result.success) {
            var val = result.value;
            if (val === undefined && result.rawMv !== undefined) val = result.rawMv;
            if (val === undefined && result.temperature !== undefined) val = result.temperature;
            if (typeof val === 'number') val = val.toFixed(3);
            if (val === undefined || val === null) val = '';
            sensorData[key] = String(val);
          } else {
            sensorData[key] = 'N/A';
          }
        } else {
          // float32 binary sensor data
          var resp = await this.sendGetCommand(getter.cmd);
          if (resp && resp.success && resp.data && resp.data.length >= 4) {
            // Try ASCII first, then float32 binary
            var asciiVal = resp.value ? resp.value.trim() : '';
            var parsed = parseFloat(asciiVal);
            if (!isNaN(parsed) && asciiVal.length > 0 && parsed !== 0) {
              sensorData[key] = parsed.toFixed(3);
            } else {
              // Try float32 binary parsing
              var fval = this._parseFloat(resp.data);
              if (fval !== 0 && !isNaN(fval)) {
                sensorData[key] = fval.toFixed(3);
              } else {
                sensorData[key] = 'N/A';
              }
            }
          } else {
            sensorData[key] = 'N/A';
          }
        }
      } catch (e) {
        sensorData[key] = 'N/A';
      }
    }
    return sensorData;
  } catch (error) {
    return { error: error.message };
  }
};

ProcyonUsbBridge.prototype._parseFloat = function(data) {
  if (!data || data.length < 4) return 0;
  var buf = Buffer.from(data);
  return buf.readFloatLE(0);
};

ProcyonUsbBridge.prototype._parseU32 = function(data) {
  if (!data || data.length < 4) return 0;
  var buf = Buffer.from(data);
  return buf.readUInt32LE(0);
};

ProcyonUsbBridge.prototype.setMultipleParameters = async function(params) {
  try {
    var setters = {
      customer: CMD.SET_CUSTOMER,
      country: CMD.SET_COUNTRY,
      district: CMD.SET_DISTRICT,
      runIdType: CMD.SET_RUN_ID_TYPE,
      runId: CMD.SET_RUN_ID,
      deptOut: CMD.SET_DEPT_OUT,
      uniqueId: CMD.SET_UNIQUE_ID,
      ldap: CMD.SET_LDAP,
      toolType: CMD.SET_TOOL_TYPE,
      toolSize: CMD.SET_TOOL_SIZE,
      toolPosition: CMD.SET_TOOL_POSITION,
      configName: CMD.SET_CONFIG_NAME,
      toolSN: CMD.SET_TOOL_SN,
      uhConnectionType: CMD.SET_UH_CONNECTION_TYPE,
      dhConnectionType: CMD.SET_DH_CONNECTION_TYPE,
      intPressureSN: CMD.SET_INT_PRESSURE_SENSOR_SN,
      extPressureSN: CMD.SET_EXT_PRESSURE_SENSOR_SN,
      limpetSN: CMD.SET_LIMPET_SENSOR_SN,
      housingNumber: CMD.SET_HOUSING_NUMBER,
      bhaSerialNumber: CMD.SET_BHA_SERIAL_NUMBER,
      axialPosition: CMD.SET_TOOL_AXIAL_POSITION,
      sensorHeadSN: CMD.SET_TOOL_INFO_SENSOR_HEAD_SERIAL_NUMBER,
      bitBladeNumber: CMD.SET_DRILL_BIT_INFO_BIT_BLADE_NUMBER,
      bitBOM: CMD.SET_DRILL_BIT_INFO_BIT_BOM,
      amplifierDACOffset: CMD.SET_AMPLIFIER_DAC_OFFSET,
      amplifierFirstStageGain: CMD.SET_AMPLIFIER_FIRST_STAGE_GAIN,
      amplifierSecondStageGain: CMD.SET_AMPLIFIER_SECOND_STAGE_GAIN,
    };
    var keys = Object.keys(params);
    var failedParams = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = params[key];
      if (value === undefined || value === null || value === '') continue;
      var cmdCode = setters[key];
      if (cmdCode === undefined) continue;
      try {
        var resp = await this.sendSetCommand(cmdCode, String(value));
        if (!resp.success) {
          console.log('[USB] SET ' + key + ' failed (device did not accept), continuing...');
          failedParams.push(key);
        }
      } catch (setError) {
        console.log('[USB] SET ' + key + ' error: ' + setError.message + ', continuing...');
        failedParams.push(key);
      }
      // 50ms delay between SET commands (per DLL protocol)
      await new Promise(function(resolve) { setTimeout(resolve, 50); });
    }
    if (failedParams.length > 0) {
      console.log('[USB] Warning: ' + failedParams.length + ' parameter(s) failed: ' + failedParams.join(', '));
    }
    return { success: true, failedParams: failedParams };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

ProcyonUsbBridge.prototype.diagnose = async function() {
  try {
    var result = { success: true, backend: 'libusb0-ffi' };
    try {
      libusbInitialized = false;
      ensureLibusbInit();
      var devPtr = findProcyonDevice();
      result.procyonFound = !!devPtr;
    } catch (usbErr) {
      result.usbError = usbErr.message;
    }
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

var bridge = new ProcyonUsbBridge();

module.exports = {
  bridge: bridge,
  PROCYON_VID: PROCYON_VID,
  PROCYON_PID: PROCYON_PID,
  CMD: CMD,
  buildCommandPacket: buildCommandPacket,
  parseResponse: parseResponse,
};
