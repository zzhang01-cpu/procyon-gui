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
  GET_NUMBER_MEMORY_PARTITIONS: 0x000A,
  GET_MEMORY_DUMP_CHUNK_DATA: 0x0010,
  GET_PARTITION_WRITTEN_BYTE_COUNT: 0x0019,
  GET_PARTITION_NUMBER_CHUNKS_WRITTEN: 0x001B,
  GET_PARTITION_TOTAL_NUMBER_CHUNKS: 0x001D,
  GET_MEMORY_DUMP_CHUNK_SIZE: 0x001F,
  MEMORY_ERASE_USED: 0x0030,
  MEMORY_ERASE_ALL: 0x0032,
  GET_MEMORY_ERASE_PERCENT: 0x0034,
  MEMORY_DUMP_START: 0x000C,
  MEMORY_DUMP_END: 0x000E,
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
  GET_TOOL_TYPE: 0x0130, SET_TOOL_TYPE: 0x0132,
  GET_TOOL_AXIAL_POSITION: 0x0134, SET_TOOL_AXIAL_POSITION: 0x0136,
  GET_TOOL_SIZE: 0x0138, SET_TOOL_SIZE: 0x013A,
  GET_TOOL_POSITION: 0x013C, SET_TOOL_POSITION: 0x013E,
  GET_HOUSING_NUMBER: 0x0140, SET_HOUSING_NUMBER: 0x0142,
  GET_BHA_SERIAL_NUMBER: 0x0144, SET_BHA_SERIAL_NUMBER: 0x0146,
  GET_CONFIG_NAME: 0x0148, SET_CONFIG_NAME: 0x014A,
  GET_TOOL_SN: 0x014C, SET_TOOL_SN: 0x014E,
  GET_UH_CONNECTION_TYPE: 0x0160, SET_UH_CONNECTION_TYPE: 0x0162,
  GET_DH_CONNECTION_TYPE: 0x0164, SET_DH_CONNECTION_TYPE: 0x0166,
  GET_INT_PRESSURE_SENSOR_SN: 0x0168, SET_INT_PRESSURE_SENSOR_SN: 0x016A,
  GET_EXT_PRESSURE_SENSOR_SN: 0x016C, SET_EXT_PRESSURE_SENSOR_SN: 0x016E,
  GET_LIMPET_SENSOR_SN: 0x0170, SET_LIMPET_SENSOR_SN: 0x0172,
  SET_SELF_TEST_MODE: 0x0064,
  GET_SELF_TEST_MODE_STATUS: 0x0066,
  GET_GYRO_SELF_TEST_DATA: 0x0068,
  GET_GYRO_ACCEL_SELF_TEST_DATA: 0x006A,
  GET_ACCEL_SELF_TEST_DATA: 0x006C,
  GET_SPI_TEST_DATA: 0x006E,
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
    if (resp.success && resp.data && resp.data.length >= 6) {
      return { success: true, value: resp.data[0] + '.' + resp.data[1] + '.' + resp.data[2] };
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
      var rawMv = this._parseFloat(resp.data);
      // Device returns millivolts, convert to volts for display
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

ProcyonUsbBridge.prototype.downloadOneSecondData = async function() {
  return { success: false, error: 'Not yet implemented', records: [] };
};

ProcyonUsbBridge.prototype.runSelfTest = async function() {
  return { success: false, error: 'Not yet implemented', results: [] };
};

ProcyonUsbBridge.prototype.initializeLogger = async function() {
  return { success: false, error: 'Not yet implemented' };
};

// -- Utility --

ProcyonUsbBridge.prototype._parseFloat = function(data) {
  if (!data || data.length < 4) return 0;
  var buf = Buffer.alloc(4);
  buf[0] = data[0]; buf[1] = data[1]; buf[2] = data[2]; buf[3] = data[3];
  return buf.readFloatLE(0);
};

ProcyonUsbBridge.prototype._parseU32 = function(data) {
  if (!data || data.length < 4) return 0;
  var buf = Buffer.alloc(4);
  for (var i = 0; i < 4; i++) buf[i] = data[i];
  return buf.readUInt32LE(0);
};

ProcyonUsbBridge.prototype.listDevices = function() { return []; };
ProcyonUsbBridge.prototype.getDeviceInfo = function() { return this.deviceInfo; };
ProcyonUsbBridge.prototype.isConnected = function() { return this.connected; };

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
