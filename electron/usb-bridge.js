/**
 * Procyon CM USB Bridge -- Direct libusb0.dll FFI implementation
 * VERSION: 2024-06-29-v48 (structured binary record parser, .pcmbin + main.csv + per-type CSVs matching Procyon.exe)
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
var fn_usb_clear_halt = lib0.func('usb_clear_halt', 'int', [usb_dev_handle_ptr, 'uint']);
var fn_usb_reset = lib0.func('usb_reset', 'int', [usb_dev_handle_ptr]);
var fn_usb_strerror = lib0.func('usb_strerror', 'str', []);

console.log('[USB] All libusb0 functions bound OK');

var libusbInitialized = false;

// Stored parsed records from last download (kept in main process to avoid IPC serialization)
var _lastParsedRecords = [];
var _lastPhoenixRecords = [];
var _lastParseDebug = null;
var _lastAllRecords = [];
var _lastPartitionData = [];
var _lastCombinedBuffer = null;
var _lastCustomer = 'DRS';
var _lastRunId = '1';

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

// -- Command codes (from Procyon.dll Command enum, verified via ILSpy decompilation) --
var CMD = {
  // Basic GET commands
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
  // Battery / Temperature / Time
  GET_BATTERY_VOLTAGE: 0x0040,
  GET_DEVICE_TIME: 0x0042,
  SET_DEVICE_TIME: 0x0044,
  GET_TEMPERATURE_DATA_CM: 0x0046,
  // Firmware update
  ERASE_INTERNAL_FLASH: 0x0050,
  FIRMWARE_UPDATE_BUFFER: 0x0052,
  // Self test / Verification / Launch
  START_VERIFICATION: 0x0054,
  VERIFY_STATUS: 0x0056,
  LAUNCH_DEVICE: 0x0058,
  UPDATE_STATE: 0x005A,
  ABORT_FIRMWARE_UPDATE: 0x005C,
  // Amplifier
  GET_AMPLIFIER_FIRST_STAGE_GAIN: 0x0060,
  SET_AMPLIFIER_FIRST_STAGE_GAIN: 0x0062,
  GET_AMPLIFIER_SECOND_STAGE_GAIN: 0x0064,
  SET_AMPLIFIER_SECOND_STAGE_GAIN: 0x0066,
  GET_AMPLIFIER_DAC_OFFSET: 0x0068,
  SET_AMPLIFIER_DAC_OFFSET: 0x006A,
  // Sensor GET commands (CM)
  GET_ROTATIONAL_DATA_CM: 0x0090,
  GET_LOWSHOCK_DATA_CM: 0x0092,
  GET_HIGHSHOCK_DATA_CM: 0x0094,
  GET_PRESSURE_DATA_CM: 0x0096,
  // Sensor GET commands (EM)
  GET_TEMPERATURE_DATA_EM: 0x00A0,
  GET_ROTATIONAL_DATA_EM: 0x00A2,
  GET_LOWSHOCK_DATA_EM: 0x00A4,
  GET_PRESSURE_DATA_EM: 0x00A6,
  GET_LIMPET_DATA_EM: 0x00A8,
  // Flash test
  GET_FLASH_TEST_DATA: 0x00A7,
  // Self test mode (high values)
  SET_SELF_TEST_MODE: 0x0504,
  GET_SELF_TEST_MODE_STATUS: 0x0506,
  GET_ACCEL_SELF_TEST_DATA: 0x0508,
  GET_GYRO_SELF_TEST_DATA: 0x050A,
  GET_GYRO_ACCEL_SELF_TEST_DATA: 0x050C,
  GET_PRESSURRE_SELF_TEST_DATA: 0x050E,
  // Flash / Parameters
  SET_PARAMETERS_INTO_FLASH: 0x0100,
  // Job Info
  GET_CUSTOMER: 0x0102, SET_CUSTOMER: 0x0104,
  GET_COUNTRY: 0x0106, SET_COUNTRY: 0x0108,
  GET_DISTRICT: 0x010A, SET_DISTRICT: 0x010C,
  GET_RUN_ID_TYPE: 0x010E, SET_RUN_ID_TYPE: 0x0110,
  GET_RUN_ID: 0x0112, SET_RUN_ID: 0x0114,
  GET_DEPT_OUT: 0x0116, SET_DEPT_OUT: 0x0118,
  GET_UNIQUE_ID: 0x011A, SET_UNIQUE_ID: 0x011C,
  GET_LDAP: 0x011E, SET_LDAP: 0x0120,
  // Housing / BHA
  GET_HOUSING_NUMBER: 0x0140, SET_HOUSING_NUMBER: 0x0142,
  GET_BHA_SERIAL_NUMBER: 0x0144, SET_BHA_SERIAL_NUMBER: 0x0146,
  // Tool Info
  GET_TOOL_INFO_SENSOR_HEAD_SERIAL_NUMBER: 0x012C,
  SET_TOOL_INFO_SENSOR_HEAD_SERIAL_NUMBER: 0x012E,
  GET_TOOL_TYPE: 0x0130, SET_TOOL_TYPE: 0x0132,
  GET_TOOL_AXIAL_POSITION: 0x0134, SET_TOOL_AXIAL_POSITION: 0x0136,
  GET_TOOL_SIZE: 0x0138, SET_TOOL_SIZE: 0x013A,
  GET_TOOL_POSITION: 0x013C, SET_TOOL_POSITION: 0x013E,
  // Drill Bit Info
  GET_DRILL_BIT_INFO_BIT_BLADE_NUMBER: 0x0154, SET_DRILL_BIT_INFO_BIT_BLADE_NUMBER: 0x0156,
  GET_DRILL_BIT_INFO_BIT_BOM: 0x0150, SET_DRILL_BIT_INFO_BIT_BOM: 0x0152,
  // Config / Tool SN
  GET_CONFIG_NAME: 0x0148, SET_CONFIG_NAME: 0x014A,
  GET_TOOL_SN: 0x014C, SET_TOOL_SN: 0x014E,
  // Connection types (GET+SET)
  GET_UH_CONNECTION_TYPE: 0x0160, SET_UH_CONNECTION_TYPE: 0x0162,
  GET_DH_CONNECTION_TYPE: 0x0164, SET_DH_CONNECTION_TYPE: 0x0166,
  // Pressure sensor SNs (GET+SET)
  GET_INT_PRESSURE_SENSOR_SERIAL_NUMBER: 0x0168, SET_INT_PRESSURE_SENSOR_SN: 0x016A,
  GET_EXT_PRESSURE_SENSOR_SERIAL_NUMBER: 0x016C, SET_EXT_PRESSURE_SENSOR_SN: 0x016E,
  GET_LIMPET_SENSOR_SERIAL_NUMBER: 0x0170, SET_LIMPET_SENSOR_SN: 0x0172,
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

// -- USB recovery methods --

ProcyonUsbBridge.prototype.clearHalt = function() {
  if (!this.handle) {
    console.log('[USB] clearHalt: no handle');
    return { success: false, error: 'No USB handle' };
  }
  try {
    var retOut = fn_usb_clear_halt(this.handle, EP_OUT);
    console.log('[USB] clearHalt EP_OUT (0x' + EP_OUT.toString(16) + '): ret=' + retOut);
    var retIn = fn_usb_clear_halt(this.handle, EP_IN);
    console.log('[USB] clearHalt EP_IN (0x' + EP_IN.toString(16) + '): ret=' + retIn);
    var ok = (retOut === 0 && retIn === 0);
    if (!ok) {
      var errMsg = '';
      try { errMsg = fn_usb_strerror(); } catch (e) {}
      console.log('[USB] clearHalt error: ' + errMsg);
    }
    return { success: ok, retOut: retOut, retIn: retIn };
  } catch (e) {
    console.log('[USB] clearHalt exception: ' + e.message);
    return { success: false, error: e.message };
  }
};

ProcyonUsbBridge.prototype.resetDevice = function() {
  if (!this.handle) {
    console.log('[USB] resetDevice: no handle');
    return { success: false, error: 'No USB handle' };
  }
  try {
    var ret = fn_usb_reset(this.handle);
    console.log('[USB] usb_reset: ret=' + ret);
    if (ret !== 0) {
      var errMsg = '';
      try { errMsg = fn_usb_strerror(); } catch (e) {}
      console.log('[USB] usb_reset error: ' + errMsg);
    }
    return { success: ret === 0, ret: ret };
  } catch (e) {
    console.log('[USB] resetDevice exception: ' + e.message);
    return { success: false, error: e.message };
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
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(new Error('USB write error: ' + e.message));
  }
};

ProcyonUsbBridge.prototype._readFromDevice = function(expectedLength, timeout) {
  if (!expectedLength) expectedLength = 64;
  if (!timeout) timeout = READ_TIMEOUT;
  var self = this;
  if (!self.handle) return Promise.reject(new Error('USB handle not available'));
  return new Promise(function(resolve, reject) {
    try {
      var readBuf = Buffer.alloc(expectedLength);
      var bytesRead = fn_usb_bulk_read(self.handle, EP_IN, readBuf, expectedLength, timeout);
      if (bytesRead <= 0) {
        resolve(null);
      } else {
        resolve(readBuf.slice(0, bytesRead));
      }
    } catch (e) {
      reject(new Error('USB read error: ' + e.message));
    }
  });
};

ProcyonUsbBridge.prototype.sendCommand = async function(commandCode, dataBytes) {
  if (!dataBytes) dataBytes = [];
  try {
    if (!this.connected) return { success: false, error: 'Device not connected' };

    var packet = buildCommandPacket(commandCode, dataBytes);

    await this._writeToDevice(packet);
    // Small delay to allow device to process and respond
    await new Promise(function(resolve) { setTimeout(resolve, 10); });
    var response = await this._readFromDevice(4096, READ_TIMEOUT);

    if (!response || response.length < 4) {
      return { success: false, error: 'No response from device (timeout, got ' + (response ? response.length : 0) + 'B)' };
    }

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

// Send command with a known expected response length (for large responses like chunk data)
// Uses a single large read to minimize USB overhead
ProcyonUsbBridge.prototype.sendCommandWithExpectedLength = async function(commandCode, dataBytes, expectedTotalLength) {
  if (!dataBytes) dataBytes = [];
  try {
    if (!this.connected) return { success: false, error: 'Device not connected' };

    var packet = buildCommandPacket(commandCode, dataBytes);
    if (expectedTotalLength <= 100) console.log('[USB] TX CMD ' + hex4(commandCode) + ' (expect ' + expectedTotalLength + 'B): [' + hexStr(packet) + ']');

    await this._writeToDevice(packet);

    // Use a buffer large enough to read the entire response in ONE USB call
    // This is critical for speed: 2 reads per chunk = 2x slower download
    var readBufSize = Math.max(expectedTotalLength + 256, 8192);
    var savedTimeout = READ_TIMEOUT;
    READ_TIMEOUT = 5000; // 5s for data transfer

    // First read: try to get the entire response
    var firstRead = await this._readFromDevice(readBufSize, READ_TIMEOUT);
    if (!firstRead || firstRead.length === 0) {
      // Retry once with longer timeout
      READ_TIMEOUT = 8000;
      firstRead = await this._readFromDevice(readBufSize, READ_TIMEOUT);
      READ_TIMEOUT = savedTimeout;
      if (!firstRead || firstRead.length === 0) {
        console.log('[USB] sendCmdExpLen: firstRead empty/timeout, cmd=' + hex4(commandCode));
        return { success: false, error: 'No response from device (timeout), cmd=' + hex4(commandCode) };
      }
    }
    READ_TIMEOUT = savedTimeout;

    console.log('[USB] sendCmdExpLen: firstRead=' + firstRead.length + ' bytes, cmd=' + hex4(commandCode) + ', expected=' + expectedTotalLength);
    var collected = firstRead;

    // If first read didn't get everything, do additional reads
    if (collected.length < expectedTotalLength) {
      var maxExtraReads = Math.ceil((expectedTotalLength - collected.length) / 4096) + 2;
      READ_TIMEOUT = 3000;
      for (var r = 0; r < maxExtraReads; r++) {
        try {
          var extra = await this._readFromDevice(8192, READ_TIMEOUT);
          if (!extra || extra.length === 0) break;
          collected = Buffer.concat([collected, extra]);
          if (collected.length >= expectedTotalLength) break;
        } catch (readErr) {
          break;
        }
      }
      READ_TIMEOUT = savedTimeout;
    }

    if (collected.length < 4) {
      console.log('[USB] sendCmdExpLen: collected too short (' + collected.length + ' bytes), cmd=' + hex4(commandCode));
      return { success: false, error: 'Response too short (' + collected.length + 'B), cmd=' + hex4(commandCode) };
    }

    // Only log for small responses (skip for chunk data to reduce overhead)
    if (expectedTotalLength <= 100) console.log('[USB] RX: collected ' + collected.length + ' bytes total');

    var parsed = parseResponse(collected);
    if (!parsed) {
      console.log('[USB] sendCmdExpLen: parseResponse returned null, cmd=' + hex4(commandCode) + ', len=' + collected.length);
      return { success: false, error: 'Invalid response format, cmd=' + hex4(commandCode) };
    }

    var expectedRespCode = commandCode + 1;
    if (parsed.commandCode !== expectedRespCode) {
      console.log('[USB] Response code ' + hex4(parsed.commandCode) + ' != expected ' + hex4(expectedRespCode));
    }

    var value = bytesToAscii(parsed.data);
    return { success: true, data: parsed.data, value: value, commandCode: parsed.commandCode, length: parsed.length, raw: collected };
  } catch (error) {
    console.error('[USB] sendCommandWithExpectedLength error: ' + error.message);
    return { success: false, error: error.message };
  }
};

// -- GET commands --

ProcyonUsbBridge.prototype.getFirmwareVersion = async function() {
  try {
    var resp = await this.sendGetCommand(CMD.GET_FIRMWARE_VERSION);
    if (resp.success && resp.value && resp.value.length > 0) {
      // Firmware version is returned as ASCII string (e.g. "2.0.6")
      var ver = resp.value.trim();
      if (ver.length > 0) {
        return { success: true, value: ver.startsWith('v') ? ver : 'v' + ver };
      }
    }
    // Fallback: try binary parsing (some firmware versions use binary format)
    if (resp.success && resp.data && resp.data.length >= 3) {
      var major = resp.data[0];
      var minor = resp.data[1];
      var patch = resp.data[2];
      // Sanity check: if values look like ASCII chars (32-127), it's a string not binary
      if (major >= 32 && major <= 127 && minor >= 32 && minor <= 127) {
        // It's actually an ASCII string, use resp.value instead
        return { success: resp.success, value: resp.value || 'unknown' };
      }
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
        var floatValue = this._parseFloat(resp.data);
        // DLL returns Float32. Could be millivolts (e.g. 3703.0) or volts (e.g. 3.703)
        if (floatValue > 100) {
          // Likely millivolts already
          rawMv = Math.round(floatValue);
        } else if (floatValue > 0) {
          // Likely volts, convert to millivolts
          rawMv = Math.round(floatValue * 1000);
        }
      }
      return { success: true, voltage: rawMv / 1000, rawMv: rawMv };
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
      // DLL: parses response string as integer
      // Try parsing as integer from the value string first, then as raw byte
      var count = 0;
      if (resp.value && resp.value.length > 0) {
        count = parseInt(resp.value, 10);
      }
      if (isNaN(count) || count <= 0) {
        count = resp.data[0];
      }
      return { success: true, count: count };
    }
    return { success: false, count: 0 };
  } catch (error) {
    return { success: false, count: 0, error: error.message };
  }
};

// Parse UInt32 from response data (used by partition info queries)
// DLL uses GetValueFromResponse which reads the data field as a UInt32
function parseResponseUInt32(resp) {
  if (!resp.success || !resp.data || resp.data.length < 1) {
    return { success: false, count: 0 };
  }
  var d = resp.data;
  // Try ASCII value first (some responses return numbers as ASCII strings)
  if (resp.value && resp.value.length > 0) {
    var parsed = parseInt(resp.value, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 1000000) {
      return { success: true, count: parsed, source: 'ascii' };
    }
  }
  // Try raw bytes as UInt32
  if (d.length >= 4) {
    // Big-endian (network byte order, as DLL uses)
    var be = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
    // Little-endian
    var le = ((d[3] << 24) | (d[2] << 16) | (d[1] << 8) | d[0]) >>> 0;
    // Pick the reasonable one (not 0, not absurdly large)
    if (be > 0 && be < 1000000) return { success: true, count: be, source: 'be', raw: hexStr(d) };
    if (le > 0 && le < 1000000) return { success: true, count: le, source: 'le', raw: hexStr(d) };
  }
  // Single byte fallback
  if (d.length >= 1 && d[0] > 0 && d[0] < 256) {
    return { success: true, count: d[0], source: 'byte', raw: hexStr(d) };
  }
  return { success: false, count: 0, raw: hexStr(d) };
}

ProcyonUsbBridge.prototype.getWrittenChunksForPartition = async function(partition) {
  try {
    var resp = await this.sendCommand(CMD.GET_PARTITION_NUMBER_CHUNKS_WRITTEN, [partition & 0xFF]);
    console.log('[USB] WrittenChunks P' + partition + ': success=' + resp.success +
      ' dataLen=' + (resp.data ? resp.data.length : 'null') +
      ' value=' + JSON.stringify(resp.value) +
      ' raw=' + (resp.data ? hexStr(resp.data) : 'n/a'));
    return parseResponseUInt32(resp);
  } catch (error) {
    return { success: false, count: 0, error: error.message };
  }
};

ProcyonUsbBridge.prototype.getPartitionTotalChunks = async function(partition) {
  try {
    var resp = await this.sendCommand(CMD.GET_PARTITION_TOTAL_NUMBER_CHUNKS, [partition & 0xFF]);
    console.log('[USB] TotalChunks P' + partition + ': success=' + resp.success +
      ' dataLen=' + (resp.data ? resp.data.length : 'null') +
      ' value=' + JSON.stringify(resp.value) +
      ' raw=' + (resp.data ? hexStr(resp.data) : 'n/a'));
    return parseResponseUInt32(resp);
  } catch (error) {
    return { success: false, count: 0, error: error.message };
  }
};

ProcyonUsbBridge.prototype.getPartitionWrittenByteCount = async function(partition) {
  try {
    var resp = await this.sendCommand(CMD.GET_PARTITION_WRITTEN_BYTE_COUNT, [partition & 0xFF]);
    console.log('[USB] WrittenBytes P' + partition + ': success=' + resp.success +
      ' dataLen=' + (resp.data ? resp.data.length : 'null') +
      ' value=' + JSON.stringify(resp.value) +
      ' raw=' + (resp.data ? hexStr(resp.data) : 'n/a'));
    return parseResponseUInt32(resp);
  } catch (error) {
    return { success: false, count: 0, error: error.message };
  }
};

// Get the chunk size from the device
ProcyonUsbBridge.prototype.getMemoryDumpChunkSize = async function() {
  try {
    var resp = await this.sendCommand(CMD.GET_MEMORY_DUMP_CHUNK_SIZE);
    console.log('[USB] ChunkSize: success=' + resp.success +
      ' dataLen=' + (resp.data ? resp.data.length : 'null') +
      ' value=' + JSON.stringify(resp.value) +
      ' raw=' + (resp.data ? hexStr(resp.data) : 'n/a'));
    return parseResponseUInt32(resp);
  } catch (error) {
    return { success: false, count: 0, error: error.message };
  }
};

ProcyonUsbBridge.prototype.getDumpChunkData = async function(partition, chunkNumber) {
  try {
    var data = [
      partition & 0xFF,
      chunkNumber & 0xFF,
      (chunkNumber >> 8) & 0xFF,
      (chunkNumber >> 16) & 0xFF,
      (chunkNumber >> 24) & 0xFF
    ];
    // DLL says ResponseLength=8062 (4 header + 1 partition + 1 status + 4 chunkNum + 8052 data)
    var resp = await this.sendCommandWithExpectedLength(CMD.GET_MEMORY_DUMP_CHUNK_DATA, data, 8062);
    if (resp.success && resp.data && resp.data.length > 6) {
      // resp.data is parsed.data which is after 4-byte cmd header
      // Format: [PartitionNumber(1B), Status(1B), ChunkNumber(4B), Data(8052B)]
      var status = resp.data[1];
      if (status === 0) {
        // Status 0 = no data for this chunk (partition/chunk not written)
        return { success: true, data: null, status: status };
      }
      // Skip 6-byte sub-header (partition + status + chunkNumber)
      var chunkData = resp.data.slice(6);
      return { success: true, data: chunkData, status: status };
    }
    return { success: false, data: null };
  } catch (error) {
    return { success: false, data: null, error: error.message };
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

// Parse binary records from downloaded partition data (main process)
// Record format from RecordFormatFiles.json (v2.1+):
//   0xA0 OneSecondData: 81 bytes (1 type + 2 temp + 2 batt + 12×2 rpm + 12×2 shockLow + 12×2 shock + 2 lateralMax + 2 lateralRms)
//   0xD1 PhoenixOneSecondData: 9 bytes (1 type + 2 psiMin + 2 psiMax + 2 psiAvg + 2 tempAvg)
//   0xFF Flush: 1 byte, 0xFE LoggingSystemError: 1 byte, 0xD0 DebugEvent: 1 byte
//   csv_chain records (0x80/0x90/0x91): fixed sample size, chain ends at next different type
//
// STRATEGY: Sequential parsing with validation.
// We start from offset 0 and parse records sequentially by their known sizes.
// If an 0xA0 record has temperature outside [-40,150]°C, we scan forward to find
// the next valid 0xA0 boundary and resume from there.
// This handles variable-size records (0x01 FirmwareVersion) that may misalign.
// =========================================================================
// STRUCTURED BINARY RECORD PARSER (v48)
// =========================================================================
// Record format in .pcmbin files (confirmed from Procyon.exe output analysis):
//   [type_with_flag(1B)] [metadata(7B)] [body(N bytes)]
//   - type_with_flag: record type, bit 0 may be set as validity flag
//   - metadata: [timestamp_or_seq(4B)] [recordId(2B)] [bodySize_hint(1B)]
//   - body: N bytes depending on record type (from RecordFormatFiles.json v2.1+)
//
// Known record types and their body sizes:
//   0x01 FirmwareVersion: 4 bytes (u8x4)
//   0x02 Reset: 4 bytes (b32)
//   0x0D FlashDeviceID: 16 bytes (u8x16)
//   0x0E FlashBadBlockList: variable (u16 array, scan to next type)
//   0x80 RpmAxialWaveform: csv_chain, variable (s16 array)
//   0x81 GyroTagDataCorrupt: 4 bytes (u32)
//   0x82 StickSlip: 4 bytes (f32)
//   0x83 FilteredRpmStats: 6 bytes (3xs16)
//   0x84 FilteredRpmWaveform: csv_chain, 52 bytes (26xs16)
//   0x90 AccelWaveform: csv_chain, variable (s16x3 per sample)
//   0x91 LowShockWaveform: csv_chain, variable (s16x3 per sample)
//   0xA0 OneSecondData: csv_chain, 80 bytes (40xs16)
//   0xD1 PhoenixOneSecondData: csv_chain, 8 bytes (4xs16 or 4xu16 for v2.3+)
//   0xFF Flush: variable (to end of buffer)

// Record type definitions (v2.1+)
var RECORD_DEFS = {
  0x01: { name: 'FirmwareVersion', bodySize: 4, fields: [
    { name: 'VersionBytes', count: 4, fmt: 'u8' }
  ]},
  0x02: { name: 'Reset', bodySize: 4, fields: [
    { name: 'ResetReason', count: 1, fmt: 'b32' }
  ]},
  0x0D: { name: 'FlashDeviceID', bodySize: 16, fields: [
    { name: 'DeviceID', count: 16, fmt: 'u8' }
  ]},
  0x0E: { name: 'FlashBadBlockList', bodySize: 'variable', fields: [
    { name: 'BadBlockList', count: 'auto', fmt: 'u16' }
  ]},
  0x80: { name: 'RpmAxialWaveform', bodySize: 'csv_chain', csvChain: true, fields: [
    { name: 'RpmXAxis', count: 'auto', fmt: 's16' }
  ]},
  0x81: { name: 'GyroTagDataCorrupt', bodySize: 4, fields: [
    { name: 'Count', count: 1, fmt: 'u32' }
  ]},
  0x82: { name: 'StickSlip', bodySize: 24, fields: [
    { name: 'SlipPercent', count: 3, fmt: 'f32' },
    { name: 'SlipPeriod', count: 3, fmt: 'f32' }
  ]},
  0x83: { name: 'FilteredRpmStats', bodySize: 6, fields: [
    { name: 'Min', count: 1, fmt: 's16' },
    { name: 'Max', count: 1, fmt: 's16' },
    { name: 'Avg', count: 1, fmt: 's16' }
  ]},
  0x84: { name: 'FilteredRpmWaveform', bodySize: 52, csvChain: true, fields: [
    { name: 'Samples', count: 26, fmt: 's16' }
  ]},
  0x85: { name: 'RpmHighFreqFftPeaks', bodySize: 12, fields: [
    { name: 'Peak1', count: 1, fmt: 's16' },
    { name: 'Peak2', count: 1, fmt: 's16' },
    { name: 'Peak3', count: 1, fmt: 's16' },
    { name: 'Peak4', count: 1, fmt: 's16' },
    { name: 'Peak5', count: 1, fmt: 's16' },
    { name: 'Peak6', count: 1, fmt: 's16' }
  ]},
  0x90: { name: 'AccelWaveform', bodySize: 'csv_chain', csvChain: true, fields: [
    { name: 'AccelX', count: 'auto', fmt: 's16' },
    { name: 'AccelY', count: 'auto', fmt: 's16' },
    { name: 'AccelZ', count: 'auto', fmt: 's16' }
  ]},
  0x91: { name: 'LowShockWaveform', bodySize: 'csv_chain', csvChain: true, fields: [
    { name: 'ShockX', count: 'auto', fmt: 's16' },
    { name: 'ShockY', count: 'auto', fmt: 's16' },
    { name: 'ShockZ', count: 'auto', fmt: 's16' }
  ]},
  0x92: { name: 'ShockXFftPeaks', bodySize: 12, fields: [
    { name: 'Peak1', count: 1, fmt: 's16' },
    { name: 'Peak2', count: 1, fmt: 's16' },
    { name: 'Peak3', count: 1, fmt: 's16' },
    { name: 'Peak4', count: 1, fmt: 's16' },
    { name: 'Peak5', count: 1, fmt: 's16' },
    { name: 'Peak6', count: 1, fmt: 's16' }
  ]},
  0x93: { name: 'ShockYFftPeaks', bodySize: 12, fields: [
    { name: 'Peak1', count: 1, fmt: 's16' },
    { name: 'Peak2', count: 1, fmt: 's16' },
    { name: 'Peak3', count: 1, fmt: 's16' },
    { name: 'Peak4', count: 1, fmt: 's16' },
    { name: 'Peak5', count: 1, fmt: 's16' },
    { name: 'Peak6', count: 1, fmt: 's16' }
  ]},
  0x94: { name: 'ShockZFftPeaks', bodySize: 12, fields: [
    { name: 'Peak1', count: 1, fmt: 's16' },
    { name: 'Peak2', count: 1, fmt: 's16' },
    { name: 'Peak3', count: 1, fmt: 's16' },
    { name: 'Peak4', count: 1, fmt: 's16' },
    { name: 'Peak5', count: 1, fmt: 's16' },
    { name: 'Peak6', count: 1, fmt: 's16' }
  ]},
  0xA0: { name: 'OneSecondData', bodySize: 80, csvChain: true, fields: [
    { name: 'Temperature', count: 1, fmt: 's16', offset: 0.0, scale: 0.03125 },
    { name: 'BatteryV', count: 1, fmt: 's16', offset: 0.0, scale: 0.00102742785669614938 },
    { name: 'RpmMinX', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmMaxX', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmAvgX', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmRmsX', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmMinY', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmMaxY', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmAvgY', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmRmsY', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmMinZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmMaxZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmAvgZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'RpmRmsZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.02333333333333333333 },
    { name: 'ShockLowMinX', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowMaxX', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowAvgX', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowRmsX', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowMinY', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowMaxY', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowAvgY', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowRmsY', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowMinZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowMaxZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowAvgZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockLowRmsZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.000244 },
    { name: 'ShockMinX', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockMaxX', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockAvgX', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockRmsX', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockMinY', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockMaxY', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockAvgY', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockRmsY', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockMinZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockMaxZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockAvgZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockRmsZ', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockLateralMax', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 },
    { name: 'ShockLateralRms', count: 1, fmt: 's16', offset: 0.0, scale: 0.2 }
  ]},
  0xD1: { name: 'PhoenixOneSecondData', bodySize: 8, csvChain: true, fields: [
    { name: 'PsiMin', count: 1, fmt: 'u16' },
    { name: 'PsiMax', count: 1, fmt: 'u16' },
    { name: 'PsiAvg', count: 1, fmt: 'u16' },
    { name: 'TempAvg', count: 1, fmt: 'u16' }
  ]},
  0xFF: { name: 'Flush', bodySize: 'variable', fields: [] }
};

// Helper: read a typed value from buffer at offset
function readTypedValue(buf, offset, fmt) {
  switch (fmt) {
    case 'u8': return buf.readUInt8(offset);
    case 'u16': return buf.readUInt16LE(offset);
    case 'u32': return buf.readUInt32LE(offset);
    case 's16': return buf.readInt16LE(offset);
    case 's32': return buf.readInt32LE(offset);
    case 'f32': return buf.readFloatLE(offset);
    case 'b32': return buf.readUInt32LE(offset);
    default: return 0;
  }
}

// Helper: byte size of format type
function fmtSize(fmt) {
  switch (fmt) {
    case 'u8': return 1;
    case 'u16': case 's16': return 2;
    case 'u32': case 's32': case 'f32': case 'b32': return 4;
    default: return 0;
  }
}

// Parse ALL binary records from raw buffer
// Returns: { records: [...], debug: [...] }
function parseBinaryRecords(rawData) {
  var buf = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
  var records = [];
  var debug = [];
  var i = 0;

  debug.push('parseBinaryRecords: buffer size=' + buf.length + ' bytes');

  // After the Flush record (which marks end of metadata area), only recognize
  // sensor record types (0x80-0x91, 0xA0, 0xD1) to avoid false positives
  // from metadata bytes appearing in sensor data values
  var afterFlush = false;
  var SENSOR_TYPES = { 0x80:1, 0x81:1, 0x82:1, 0x83:1, 0x84:1, 0x85:1, 0x90:1, 0x91:1, 0x92:1, 0x93:1, 0x94:1, 0xA0:1, 0xD1:1 };

  // In the sensor area, records form a continuous chain with no gaps.
  // Track the expected next offset and validate that each record starts there.
  var expectedNextOffset = null;

  while (i < buf.length) {
    var rawType = buf[i];
    var recType = rawType & 0xFE;
    if (!RECORD_DEFS[recType]) recType = rawType;
    if (!RECORD_DEFS[recType]) recType = rawType | 0x02;
    if (!RECORD_DEFS[recType]) recType = rawType;

    // In sensor-only mode, skip non-sensor record types
    if (afterFlush && !SENSOR_TYPES[recType]) {
      i++;
      continue;
    }

    // Chain validation for sensor area: records must be contiguous.
    // If the chain breaks, skip forward byte-by-byte to find the next valid record.
    if (afterFlush && expectedNextOffset !== null && i !== expectedNextOffset) {
      i++;
      continue;
    }

    var def = RECORD_DEFS[recType];
    if (!def) {
      i++;
      continue;
    }

    var metaStart = i + 1;
    if (metaStart + 7 > buf.length) break;
    var meta = buf.slice(metaStart, metaStart + 7);

    var bodyStart = metaStart + 7;
    var bodySize = def.bodySize;

    // metadata[6] is the body size for most records. Use it when reasonable.
    var hintSize = meta[6];
    var useHint = false;

    if (bodySize === 'variable') {
      // For 'variable' records (0x0E FlashBadBlockList), metadata[6] IS the body size
      // BUT NOT for 0xFF Flush which has metadata[6] that doesn't match its large body
      if (recType !== 0xFF && hintSize > 0 && hintSize <= buf.length - bodyStart) {
        bodySize = hintSize;
        useHint = true;
      }
    } else if (bodySize === 'csv_chain') {
      // For 'csv_chain' records, metadata[6] is body size for small records (≤200 bytes)
      // BUT NOT for 0xFF Flush which has metadata[6] that doesn't match its large body
      if (recType !== 0xFF && hintSize > 0 && hintSize <= 200 && bodyStart + hintSize <= buf.length) {
        bodySize = hintSize;
        useHint = true;
      }
    } else if (typeof bodySize === 'number' && bodySize > 0) {
      // For fixed-size records: if metadata[6] differs from known size but is reasonable,
      // trust metadata[6] (e.g. 0x0D FlashDeviceID with metadata[6]=160 is actually FlashBadBlockList)
      if (hintSize > 0 && hintSize !== bodySize && hintSize <= 10000 && bodyStart + hintSize <= buf.length) {
        bodySize = hintSize;
        useHint = true;
      }
    }

    // If still unresolved, scan for next valid record marker
    if (!useHint && (bodySize === 'variable' || bodySize === 'csv_chain')) {
        for (var s = bodyStart; s < Math.min(buf.length, bodyStart + 100000); s++) {
          var candidateRaw = buf[s];
          // Skip 0xFF padding bytes (empty flash memory)
          if (candidateRaw === 0xFF) continue;
          // Determine candidate type
          var candidateType = candidateRaw & 0xFE;
          if (!RECORD_DEFS[candidateType] && RECORD_DEFS[candidateRaw]) {
            candidateType = candidateRaw;
          }
          // Validate: the candidate must be a known type AND have valid-looking metadata
          if (RECORD_DEFS[candidateType] && s > bodyStart) {
            var metaValid = true;
            if (s + 8 <= buf.length) {
              var allFF = true, allZero = true;
              for (var mv = 1; mv <= 7; mv++) {
                if (buf[s + mv] !== 0xFF) allFF = false;
                if (buf[s + mv] !== 0x00) allZero = false;
              }
              if (allFF || allZero) metaValid = false;
              // Stricter: for fixed-size types, metadata[6] must match the known body size
              if (metaValid && typeof RECORD_DEFS[candidateType].bodySize === 'number' && RECORD_DEFS[candidateType].bodySize > 0) {
                if (buf[s + 7] !== RECORD_DEFS[candidateType].bodySize) {
                  metaValid = false;
                }
              }
            }
            if (metaValid) {
              bodySize = s - bodyStart;
              break;
            }
          }
        }
      }
      if (bodySize === 'variable' || bodySize === 'csv_chain') {
        bodySize = buf.length - bodyStart;
      }

    if (bodySize === 'to_end') {
      bodySize = buf.length - bodyStart;
    }

    if (bodyStart + bodySize > buf.length) {
      bodySize = buf.length - bodyStart;
    }

    if (bodySize < 0) {
      debug.push('WARN: negative bodySize at offset 0x' + i.toString(16) + ', type=0x' + recType.toString(16));
      break;
    }

    var body = bodySize > 0 ? buf.slice(bodyStart, bodyStart + bodySize) : Buffer.alloc(0);

    // Parse fields
    var parsed = {};
    var fieldOffset = 0;
    for (var fi = 0; fi < def.fields.length; fi++) {
      var fdef = def.fields[fi];
      var count = fdef.count;
      if (count === 'auto') {
        var fsz = fmtSize(fdef.fmt);
        count = Math.floor((body.length - fieldOffset) / fsz);
        if (count < 0) count = 0;
      }

      if (count === 1) {
        var fsz1 = fmtSize(fdef.fmt);
        if (fieldOffset + fsz1 > body.length) break;
        var raw = readTypedValue(body, fieldOffset, fdef.fmt);
        if (fdef.scale !== undefined) {
          parsed[fdef.name] = (fdef.offset || 0) + raw * fdef.scale;
        } else {
          parsed[fdef.name] = raw;
        }
        fieldOffset += fsz1;
      } else if (count > 1) {
        var arr = [];
        var fsz2 = fmtSize(fdef.fmt);
        for (var ci = 0; ci < count; ci++) {
          var off = fieldOffset + ci * fsz2;
          if (off + fsz2 > body.length) break;
          var rv = readTypedValue(body, off, fdef.fmt);
          if (fdef.scale !== undefined) {
            arr.push((fdef.offset || 0) + rv * fdef.scale);
          } else {
            arr.push(rv);
          }
        }
        parsed[fdef.name] = arr;
        fieldOffset += count * fsz2;
      }
    }

    var rec = {
      type: recType,
      rawType: rawType,
      name: def.name,
      offset: i,
      bodySize: bodySize,
      metadata: meta,
      parsed: parsed,
      csvChain: def.csvChain || false,
      body: body
    };

    records.push(rec);

    // After a real Flush record (body > 1000), enter sensor-only mode
    // and set the expected next offset to the first byte after the Flush
    if (!afterFlush && recType === 0xFF && bodySize > 1000) {
      afterFlush = true;
      expectedNextOffset = bodyStart + bodySize;
    }

    // Update chain validation: next record must start at bodyStart + bodySize
    if (afterFlush) {
      expectedNextOffset = bodyStart + bodySize;
    }

    i = bodyStart + bodySize;
  }

  // Generate debug summary
  var typeCounts = {};
  for (var ri = 0; ri < records.length; ri++) {
    var t = records[ri].name;
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  var summary = [];
  var typeKeys = Object.keys(typeCounts);
  for (var tk = 0; tk < typeKeys.length; tk++) {
    summary.push('  ' + typeKeys[tk] + ': ' + typeCounts[typeKeys[tk]]);
  }
  debug.push('Records found: ' + records.length);
  debug = debug.concat(summary);
  debug.push('Bytes parsed: ' + i + '/' + buf.length);

  return { records: records, debug: debug };
}

// Generate main.csv content matching Procyon.exe format
// Columns: Location, StatusMsg, RecordId, RecordName, Timestamp, BodyByteLen, {type-specific fields}
function generateMainCsv(records) {
  var lines = [];
  lines.push('Location,StatusMsg,RecordId,RecordName,Timestamp,BodyByteLen');
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    var ts = new Date();
    if (i > 0 && records[0]._timestamp) {
      ts = new Date(records[0]._timestamp + i * 1000);
    }

    var tsStr = ts.getFullYear() + '-' +
      String(ts.getMonth() + 1).padStart(2, '0') + '-' +
      String(ts.getDate()).padStart(2, '0') + ' ' +
      String(ts.getHours()).padStart(2, '0') + ':' +
      String(ts.getMinutes()).padStart(2, '0') + ':' +
      String(ts.getSeconds()).padStart(2, '0');

    var row = '0x' + rec.offset.toString(16) + ',okay,0x' +
      rec.type.toString(16).toUpperCase().padStart(2, '0') + ',' +
      rec.name + ',' + tsStr + ',' + rec.bodySize;

    var p = rec.parsed;
    var fieldKeys = Object.keys(p);
    for (var fi = 0; fi < fieldKeys.length; fi++) {
      var fk = fieldKeys[fi];
      var fv = p[fk];
      if (Array.isArray(fv)) {
        row += ',' + fk + '=,' + fv.join(',');
      } else {
        row += ',' + fk + '=,' + fv;
      }
    }
    lines.push(row);
  }
  return lines.join('\n');
}

// Generate per-type CSV for csv_chain records (matching Procyon.exe format)
function generateTypeCsv(records, typeId) {
  var def = RECORD_DEFS[typeId];
  if (!def) return '';

  var filtered = [];
  for (var i = 0; i < records.length; i++) {
    if (records[i].type === typeId) filtered.push(records[i]);
  }
  if (filtered.length === 0) return '';

  var lines = [];
  var header = 'Location,StatusMsg,RecordId,RecordName,Timestamp,BodyByteLen';
  var fieldNames = [];
  for (var fi = 0; fi < def.fields.length; fi++) {
    var fdef = def.fields[fi];
    if (fdef.count === 1) {
      fieldNames.push(fdef.name);
    } else if (fdef.count > 1 && fdef.count !== 'auto') {
      for (var ci = 0; ci < fdef.count; ci++) {
        fieldNames.push(fdef.name + ci);
      }
    } else {
      fieldNames.push(fdef.name);
    }
  }
  header += ',' + fieldNames.join(',');
  lines.push(header);

  for (var ri = 0; ri < filtered.length; ri++) {
    var rec = filtered[ri];
    var ts = new Date();
    if (ri > 0 && filtered[0]._timestamp) {
      ts = new Date(filtered[0]._timestamp + ri * 1000);
    }

    var tsStr = ts.getFullYear() + '-' +
      String(ts.getMonth() + 1).padStart(2, '0') + '-' +
      String(ts.getDate()).padStart(2, '0') + ' ' +
      String(ts.getHours()).padStart(2, '0') + ':' +
      String(ts.getMinutes()).padStart(2, '0') + ':' +
      String(ts.getSeconds()).padStart(2, '0');

    var row = '0x' + rec.offset.toString(16) + ',okay,0x' +
      rec.type.toString(16).toUpperCase().padStart(2, '0') + ',' +
      rec.name + ',' + tsStr + ',' + rec.bodySize;

    var p = rec.parsed;
    for (var fi2 = 0; fi2 < def.fields.length; fi2++) {
      var fdef2 = def.fields[fi2];
      var fv2 = p[fdef2.name];
      if (Array.isArray(fv2)) {
        row += ',' + fv2.join(',');
      } else {
        row += ',' + (fv2 !== undefined ? fv2 : '');
      }
    }
    lines.push(row);
  }
  return lines.join('\n');
}

// Backward-compatible parse: extract 0xA0 OneSecondData and 0xD1 Phoenix records
function parseDownloadedRecords(rawData) {
  var result = parseBinaryRecords(rawData);
  var oneSecondRecords = [];
  var phoenixRecords = [];

  for (var i = 0; i < result.records.length; i++) {
    var rec = result.records[i];
    if (rec.type === 0xA0) {
      var p = rec.parsed;
      var a0Rec = {
        type: 0xA0,
        timestamp: Date.now() + oneSecondRecords.length * 1000,
        temperature: p.Temperature || 0,
        batteryVoltage: p.BatteryV || 0,
        rpmXMin: p.RpmMinX || 0, rpmXMax: p.RpmMaxX || 0, rpmXAvg: p.RpmAvgX || 0, rpmXRms: p.RpmRmsX || 0,
        rpmYMin: p.RpmMinY || 0, rpmYMax: p.RpmMaxY || 0, rpmYAvg: p.RpmAvgY || 0, rpmYRms: p.RpmRmsY || 0,
        rpmZMin: p.RpmMinZ || 0, rpmZMax: p.RpmMaxZ || 0, rpmZAvg: p.RpmAvgZ || 0, rpmZRms: p.RpmRmsZ || 0,
        shockLowXMin: p.ShockLowMinX || 0, shockLowXMax: p.ShockLowMaxX || 0, shockLowXAvg: p.ShockLowAvgX || 0, shockLowXRms: p.ShockLowRmsX || 0,
        shockLowYMin: p.ShockLowMinY || 0, shockLowYMax: p.ShockLowMaxY || 0, shockLowYAvg: p.ShockLowAvgY || 0, shockLowYRms: p.ShockLowRmsY || 0,
        shockLowZMin: p.ShockLowMinZ || 0, shockLowZMax: p.ShockLowMaxZ || 0, shockLowZAvg: p.ShockLowAvgZ || 0, shockLowZRms: p.ShockLowRmsZ || 0,
        shockXMin: p.ShockMinX || 0, shockXMax: p.ShockMaxX || 0, shockXAvg: p.ShockAvgX || 0, shockXRms: p.ShockRmsX || 0,
        shockYMin: p.ShockMinY || 0, shockYMax: p.ShockMaxY || 0, shockYAvg: p.ShockAvgY || 0, shockYRms: p.ShockRmsY || 0,
        shockZMin: p.ShockMinZ || 0, shockZMax: p.ShockMaxZ || 0, shockZAvg: p.ShockAvgZ || 0, shockZRms: p.ShockRmsZ || 0,
        shockLateralMax: p.ShockLateralMax || 0, shockLateralRms: p.ShockLateralRms || 0
      };
      oneSecondRecords.push(a0Rec);
    } else if (rec.type === 0xD1) {
      var pd = rec.parsed;
      phoenixRecords.push({
        type: 0xD1,
        timestamp: Date.now() + phoenixRecords.length * 1000,
        psiMin: pd.PsiMin || 0, psiMax: pd.PsiMax || 0, psiAvg: pd.PsiAvg || 0, tempAvg: pd.TempAvg || 0
      });
    }
  }

  if (result.records.length > 0) {
    result.records[0]._timestamp = Date.now();
  }

  return {
    oneSecondRecords: oneSecondRecords,
    phoenixRecords: phoenixRecords,
    debug: result.debug,
    allRecords: result.records
  };
}



ProcyonUsbBridge.prototype.downloadData = async function(onProgress) {
  var savedTimeout = READ_TIMEOUT;
  var startTime = Date.now();
  var MAX_DOWNLOAD_TIME = 300000; // 5 minutes
  var chunkReadDebug = [];

  function elapsed() { return Date.now() - startTime; }
  function checkTimeout() {
    if (elapsed() >= MAX_DOWNLOAD_TIME) throw new Error('Download timed out after ' + Math.round(elapsed()/1000) + 's');
  }

  try {
    // === Step 0: Pre-flight check - verify basic USB communication works ===
    READ_TIMEOUT = 3000;
    chunkReadDebug.push('[Step0] Pre-flight: verifying USB communication...');
    var usbWorking = false;
    try {
      var preResp = await this.sendCommand(CMD.GET_FIRMWARE_VERSION, []);
      var preMsg = 'GET_FIRMWARE_VERSION: success=' + preResp.success +
        ', value="' + (preResp.value || '') + '"' +
        (preResp.error ? ', error=' + preResp.error : '');
      console.log('[USB] ' + preMsg);
      chunkReadDebug.push('[Step0] ' + preMsg);
      if (preResp.success) {
        usbWorking = true;
      }
    } catch(e) {
      chunkReadDebug.push('[Step0] Pre-flight FAILED: ' + e.message);
    }

    // === Step 0.1: If USB not working, try clearHalt recovery ===
    if (!usbWorking) {
      chunkReadDebug.push('[Step0.1] USB not responding! Attempting clearHalt recovery...');
      var haltResult = this.clearHalt();
      chunkReadDebug.push('[Step0.1] clearHalt result: ' + JSON.stringify(haltResult));
      await new Promise(function(resolve) { setTimeout(resolve, 200); });
      // Retry basic command after clearHalt
      try {
        var retryResp = await this.sendCommand(CMD.GET_FIRMWARE_VERSION, []);
        chunkReadDebug.push('[Step0.1] After clearHalt: success=' + retryResp.success +
          ', value="' + (retryResp.value || '') + '"');
        if (retryResp.success) {
          usbWorking = true;
        }
      } catch(e) {
        chunkReadDebug.push('[Step0.1] Retry failed: ' + e.message);
      }
    }

    // === Step 1: Send MEMORY_DUMP_START ===
    var dumpStartOk = false;
    try {
      var startResp = await this.sendCommand(CMD.MEMORY_DUMP_START, []);

      if (startResp.success && startResp.commandCode === CMD.MEMORY_DUMP_START + 1) {
        dumpStartOk = true;
        chunkReadDebug.push('[Step1] Dump start ACKed OK');
      }
    } catch(e) {
      var errMsg = 'MEMORY_DUMP_START exception: ' + e.message;
      console.log('[USB] ' + errMsg);
      chunkReadDebug.push('[Step1] ' + errMsg);
    }
    if (!dumpStartOk) {
      // Try clearing halt and retrying
      chunkReadDebug.push('[Step1] Dump start NOT ACKed. Trying clearHalt + retry...');
      this.clearHalt();
      await new Promise(function(resolve) { setTimeout(resolve, 200); });
      try {
        var startResp2 = await this.sendCommand(CMD.MEMORY_DUMP_START, []);
        var startMsg2 = 'MEMORY_DUMP_START retry: success=' + startResp2.success +
          ', cmdCode=0x' + (startResp2.commandCode ? startResp2.commandCode.toString(16) : 'N/A') +
          ', value="' + (startResp2.value || '') + '"' +
          (startResp2.error ? ', error=' + startResp2.error : '');
        console.log('[USB] ' + startMsg2);
        chunkReadDebug.push('[Step1] ' + startMsg2);
        if (startResp2.success && startResp2.commandCode === CMD.MEMORY_DUMP_START + 1) {
          dumpStartOk = true;
          chunkReadDebug.push('[Step1] Dump start retry ACKed OK');
        }
      } catch(e) {
        chunkReadDebug.push('[Step1] Retry also failed: ' + e.message);
      }
    }
    if (!dumpStartOk) {
      chunkReadDebug.push('[Step1] FATAL: Dump start NOT ACKed after recovery attempts. Device may have no data or be in wrong state.');
    }
    // Give device time to prepare for dump mode
    await new Promise(function(resolve) { setTimeout(resolve, 500); });

    // === Step 2: Get number of partitions ===
    READ_TIMEOUT = 2000;
    var numPartitions = 0;
    chunkReadDebug.push('[Step2] Getting partition count...');
    var partResp = await this.getMemoryPartitions();
    var partMsg = 'Partition query: success=' + partResp.success + ', count=' + (partResp.count || 0);
    console.log('[USB] ' + partMsg);
    chunkReadDebug.push('[Step2] ' + partMsg);
    if (partResp.success && partResp.count > 0) {
      numPartitions = partResp.count;
    }
    if (numPartitions === 0) {
      numPartitions = 1; // Assume at least 1 partition
      chunkReadDebug.push('[Step2] No partition count, assuming 1');
    }

    // === Step 3: Download data using dynamic response reading (v23 proven approach) ===
    // CRITICAL: Empty chunks return SHORT responses, not full 8062 bytes.
    // sendCommandWithExpectedLength tries to read 8062 bytes and over-reads, corrupting the stream.
    // Instead, read the 4-byte header first, then read exactly 'length' bytes of data.
    var CHUNK_DATA_LEN = 8052;
    var MAX_EMPTY_CHUNKS = 3;
    var allData = [];
    var partitionDebug = [];

    // Helper: send chunk request and read response with dynamic length (v23 proven approach)
    var self = this;
    var readChunk = async function(partition, chunkNum, timeout) {
      var expectedRespCmd = CMD.GET_MEMORY_DUMP_CHUNK_DATA + 1; // 0x0011
      var MAX_RETRIES = 3;

      for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // On retry, do aggressive flush first
        if (attempt > 0) {
          var emptyStreak = 0;
          var flushTotal = 0;
          while (emptyStreak < 5) {
            var junk = await self._readFromDevice(4096, 30);
            if (!junk || junk.length === 0) {
              emptyStreak++;
            } else {
              emptyStreak = 0;
              flushTotal += junk.length;
            }
          }
          if (flushTotal > 0) {
            console.log('[USB] readChunk retry-flush: ' + flushTotal + ' bytes drained');
          }
          await new Promise(function(r) { setTimeout(r, 100); });
        }

        // Build command packet: [cmdLow, cmdHigh, lenLow, lenHigh, partition, chunkNum(4B BE)]
        var cmdData = [partition & 0xFF,
                       (chunkNum >> 24) & 0xFF,
                       (chunkNum >> 16) & 0xFF,
                       (chunkNum >> 8) & 0xFF,
                       chunkNum & 0xFF];
        var packet = buildCommandPacket(CMD.GET_MEMORY_DUMP_CHUNK_DATA, cmdData);
        try {
          await self._writeToDevice(Buffer.from(packet));
        } catch (writeErr) {
          console.log('[USB] readChunk write failed (attempt ' + (attempt+1) + '): ' + writeErr.message);
          continue;
        }

        // Read response - use 8192 to fit full chunk (4 header + 8058 data = 8062 bytes)
        var resp = await self._readFromDevice(8192, timeout || 5000);
        if (!resp || resp.length < 4) {
          console.log('[USB] readChunk no response (attempt ' + (attempt+1) + ', got ' + (resp ? resp.length : 0) + ' bytes)');
          continue;
        }

        // Parse header from first 4 bytes
        var respCmd = resp[0] | (resp[1] << 8);
        var respLen = resp[2] | (resp[3] << 8);

        // Validate response command
        if (respCmd !== expectedRespCmd) {
          var hdrHex = Array.from(resp.slice(0, Math.min(16, resp.length))).map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(', ');
          console.log('[USB] readChunk wrong cmd: got 0x' + respCmd.toString(16) + ' expected 0x' + expectedRespCmd.toString(16) + ', first16=' + hdrHex + ' (attempt ' + (attempt+1) + ')');
          continue;
        }

        // Validate response length
        if (respLen < 0 || respLen > 8062) {
          console.log('[USB] readChunk invalid len: ' + respLen + ' (attempt ' + (attempt+1) + ')');
          continue;
        }

        // Extract payload (may need to read more if 4096 wasn't enough)
        var payload = resp.slice(4, 4 + respLen);
        if (payload.length < respLen) {
          // Need to read more
          var remaining = respLen - payload.length;
          var more = await self._readFromDevice(remaining, timeout || 3000);
          if (more && more.length > 0) {
            payload = Buffer.concat([payload, more]);
          }
        }

        if (payload.length < respLen) {
          console.log('[USB] readChunk payload short: got ' + payload.length + ' expected ' + respLen + ' (attempt ' + (attempt+1) + ')');
          continue;
        }

        return {
          success: true,
          empty: (respLen === 0),
          respLen: respLen + 4,
          dataLen: respLen,
          data: payload,
          header: resp.slice(0, 4)
        };
      }

      // All retries failed
      return null;
    };


    READ_TIMEOUT = 3000;

    for (var p = 0; p < numPartitions; p++) {
      checkTimeout();
      var partitionData = [];
      var consecutiveEmpty = 0;
      var consecutiveFail = 0;
      var chunksRead = 0;
      var totalBytesRead = 0;
      var lastProgressTime = 0;
      var maxChunksForPartition = 20000; // Safety limit
      var emptyChunkCount = 0; // Track total empty chunks for early skip
      var partitionStart = Date.now();

      console.log('[USB] P' + (p+1) + ': reading chunks...');
      chunkReadDebug.push('P' + (p+1) + ': reading chunks...');

      for (var c = 0; c < maxChunksForPartition; c++) {
        checkTimeout();

        // Read chunk with retry (up to 3 attempts)
        var chunk = null;
        var chunkRetries = 3;
        for (var retry = 0; retry < chunkRetries; retry++) {
          try {
            chunk = await readChunk(p, c, chunksRead === 0 && emptyChunkCount > 0 ? 1500 : 5000);
            if (chunk && (chunk.success || chunk.reason === 'no header (got 0 bytes)')) {
              break; // Success or device timeout - don't retry timeout
            }
            // "wrong cmd" or "respLen too large" = stream desync - flush and retry
            if (retry < chunkRetries - 1) {
              console.log('[USB] P' + (p+1) + ' chunk' + c + ': retry ' + (retry+1) + ' after: ' + (chunk ? chunk.reason : 'null'));
              // Thorough flush before retry
              for (var fi = 0; fi < 3; fi++) {
                try { var flushed = await self._readFromDevice(8192, 50); if (!flushed || flushed.length === 0) break; } catch(e) { break; }
              }
              await new Promise(function(r) { setTimeout(r, 20); }); // Small delay
            }
          } catch (chunkErr) {
            if (retry < chunkRetries - 1) {
              console.log('[USB] P' + (p+1) + ' chunk' + c + ': retry ' + (retry+1) + ' after exception: ' + chunkErr.message);
              try { await self._readFromDevice(8192, 50); } catch(e2) {}
            } else {
              chunk = { success: false, reason: 'exception: ' + chunkErr.message };
            }
          }
        }

        // If chunk is null (all retries failed), treat as failure
        if (!chunk) {
          chunk = { success: false, reason: 'all retries exhausted' };
        }

        // Debug first 5 chunks or first empty/fail of each partition
        if (c < 5 || (!chunk.success || chunk.empty)) {
          var dbg = 'P' + (p+1) + ' chunk' + c + ': success=' + chunk.success +
            ', empty=' + chunk.empty +
            ', respLen=' + (chunk.respLen !== undefined ? chunk.respLen : 'N/A') +
            ', dataLen=' + (chunk.data ? chunk.data.length : 0) +
            (chunk.reason ? ', reason=' + chunk.reason : '') +
            (chunk.data && chunk.data.length > 0 ? ', first8=' + hexStr(chunk.data.slice(0, Math.min(8, chunk.data.length))) : '');
          console.log('[USB] ' + dbg);
          chunkReadDebug.push(dbg);
        }

        if (chunk.success) {
          consecutiveFail = 0;

          if (chunk.empty) {
            // Zero-length response = empty chunk
            consecutiveEmpty++;
            if (consecutiveEmpty >= MAX_EMPTY_CHUNKS) {
              console.log('[USB] P' + (p+1) + ': ' + consecutiveEmpty + ' empty chunks at chunk ' + c + ', stopping');
              break;
            }
            // Fast skip: if we haven't found any real data and already have 3 empty, stop
            if (chunksRead === 0 && consecutiveEmpty >= 3) {
              console.log('[USB] P' + (p+1) + ': fast skip - no real data after ' + consecutiveEmpty + ' empty chunks');
              chunkReadDebug.push('P' + (p+1) + ': fast skip (no real data found)');
              break;
            }
          } else if (chunk.data && chunk.data.length >= 6) {
            // Response has data: [PartitionNumber(1B), Status(1B), ChunkNumber(4B), Data(8052B)]
            var status = chunk.data[1];
            var respChunkNum = chunk.data[2] | (chunk.data[3] << 8) | (chunk.data[4] << 16) | (chunk.data[5] << 24);
            var payload = chunk.data.slice(6);

            if (c < 3) {
              console.log('[USB] P' + (p+1) + ' chunk' + c + ': partition=' + chunk.data[0] +
                ', status=' + status + ', respChunkNum=' + respChunkNum +
                ', payloadLen=' + payload.length +
                ', payloadFirst8=' + hexStr(payload.slice(0, Math.min(8, payload.length))));
            }

            // Status=0 means empty partition/slot
            // Also check for 0xFF-filled payload (unwritten flash)
            if (status === 0) {
              consecutiveEmpty++;
              if (consecutiveEmpty >= MAX_EMPTY_CHUNKS) {
                console.log('[USB] P' + (p+1) + ': ' + consecutiveEmpty + ' empty (status=0) at chunk ' + c);
                break;
              }
              // Fast skip: no real data found yet
              if (chunksRead === 0 && consecutiveEmpty >= 3) {
                console.log('[USB] P' + (p+1) + ': fast skip - status=0, no real data');
                chunkReadDebug.push('P' + (p+1) + ': fast skip (status=0, no real data)');
                break;
              }
            } else {
              // Has data - check for 0xFF
              var isAllFF = false;
              if (payload.length >= 64) {
                isAllFF = true;
                for (var bi = 0; bi < 64; bi++) {
                  if (payload[bi] !== 0xFF) { isAllFF = false; break; }
                }
              }
              if (isAllFF) {
                consecutiveEmpty++;
                if (consecutiveEmpty >= MAX_EMPTY_CHUNKS) {
                  console.log('[USB] P' + (p+1) + ': ' + consecutiveEmpty + ' empty (all-FF) at chunk ' + c);
                  break;
                }
              } else {
                // Real data!
                partitionData.push(Buffer.from(payload));
                totalBytesRead += payload.length;
                chunksRead++;
                consecutiveEmpty = 0;
                if (chunksRead <= 2) {
                  var preview = hexStr(payload.slice(0, Math.min(16, payload.length)));
                  chunkReadDebug.push('P' + (p+1) + ' chunk' + c + ': OK, respLen=' + chunk.respLen + ', payloadLen=' + payload.length + ', first16=' + preview);
                }
              }
            }
          } else if (chunk.data && chunk.data.length > 0 && chunk.data.length < 6) {
            // Short data response (less than 6 bytes) - likely an empty/NAK indicator
            consecutiveEmpty++;
            if (consecutiveEmpty >= MAX_EMPTY_CHUNKS) break;
            // Fast skip for short responses too
            if (chunksRead === 0 && consecutiveEmpty >= 3) {
              chunkReadDebug.push('P' + (p+1) + ': fast skip (short responses, no real data)');
              break;
            }
          }
        } else {
          // Read failure (even after retries)
          consecutiveFail++;
          consecutiveEmpty++;
          if (consecutiveFail >= 5) {
            console.log('[USB] P' + (p+1) + ': too many failures at chunk ' + c + ', stopping');
            chunkReadDebug.push('P' + (p+1) + ': stopped after 5 consecutive failures at chunk ' + c);
            break;
          }
          // Fast skip: if no real data found and already have failures
          if (chunksRead === 0 && consecutiveEmpty >= 3) {
            chunkReadDebug.push('P' + (p+1) + ': fast skip (failures with no real data)');
            break;
          }
        }

        // Yield to event loop every 5 chunks to prevent app freeze
        if (c % 5 === 0) {
          await new Promise(function(resolve) { setTimeout(resolve, 0); });
        }

        // Safety: stop if too much data read for one partition
        if (totalBytesRead >= 80 * 1024 * 1024) {
          console.log('[USB] P' + (p+1) + ': safety limit reached (' + totalBytesRead + ' bytes), stopping');
          break;
        }

        // Report progress every 300ms or every 10 chunks
        if (onProgress) {
          var now = Date.now();
          if (now - lastProgressTime > 300 || c % 10 === 0) {
            lastProgressTime = now;
            onProgress({
              partition: p + 1,
              totalPartitions: numPartitions,
              chunk: c + 1,
              totalChunks: 0,
              chunksRead: chunksRead,
              bytesDownloaded: totalBytesRead,
              percent: 0
            });
          }
        }
      }

      var finalData = partitionData.length > 0 ? Buffer.concat(partitionData) : Buffer.alloc(0);
      allData.push({
        partition: p + 1,
        data: finalData,
        size: finalData.length,
        chunksRead: chunksRead,
        writtenChunks: 0,
        totalChunks: 0,
        writtenBytes: 0
      });
      var elapsedSec = Math.round(elapsed() / 1000);
      partitionDebug.push('P' + p + ': ' + chunksRead + ' chunks, ' + finalData.length + ' bytes in ' + elapsedSec + 's');
      console.log('[USB] P' + (p+1) + ' done: ' + chunksRead + ' chunks, ' + finalData.length + ' bytes, ' + elapsedSec + 's elapsed');
    }

    // === Step 4: Check if any data was actually downloaded ===
    var totalChunksRead = allData.reduce(function(sum, p) { return sum + p.chunksRead; }, 0);
    if (totalChunksRead === 0 && chunkReadDebug.length > 0) {
      // All chunk reads failed - add diagnostic hints
      var firstFail = chunkReadDebug.find(function(d) { return d.indexOf('FAIL') >= 0 || d.indexOf('no header') >= 0; });
      if (firstFail) {
        chunkReadDebug.push('--- DIAGNOSTIC: All chunk reads failed ---');
        if (firstFail.indexOf('no header') >= 0) {
          chunkReadDebug.push('Possible causes: (1) Device not in dump mode (try re-connecting), (2) Memory is empty/erased, (3) USB communication error');
        } else if (firstFail.indexOf('wrong cmd') >= 0) {
          chunkReadDebug.push('Possible causes: (1) USB stream is corrupted (try re-connecting device), (2) Firmware version mismatch');
        } else if (firstFail.indexOf('exception') >= 0) {
          chunkReadDebug.push('Possible causes: (1) USB device disconnected, (2) Driver error');
        } else {
          chunkReadDebug.push('Possible causes: (1) Memory is empty/erased, (2) Device not responding to chunk requests, (3) Try re-connecting device');
        }
      }
    }

    // === Step 5: Concatenate all partition data and parse binary records ===
    var combinedBuffer = Buffer.concat(allData.map(function(p) { return p.data; }));
    console.log('[v48] Combined buffer: ' + combinedBuffer.length + ' bytes from ' + allData.length + ' partitions');
    var parseResult = parseDownloadedRecords(combinedBuffer);

    // === Step 6: Notify device about dump end ===
    READ_TIMEOUT = savedTimeout;
    try { await this.sendAckCommand(CMD.MEMORY_DUMP_END); } catch(e) {}
    // Store parsed records and raw data in main process for export
    _lastParsedRecords = parseResult.oneSecondRecords;
    _lastPhoenixRecords = parseResult.phoenixRecords;
    _lastAllRecords = parseResult.allRecords || [];
    _lastParseDebug = parseResult.debug || [];
    // Save per-partition raw data for .pcmbin file generation
    _lastPartitionData = allData.map(function(p) { return { partition: p.partition, data: p.data }; });
    _lastCombinedBuffer = combinedBuffer;
    // Store device parameters for file naming
    try {
      _lastCustomer = await this.getCustomer();
      _lastRunId = await this.getRunID();
    } catch(e) {
      _lastCustomer = 'DRS';
      _lastRunId = '1';
    }
    var totalRecords = parseResult.oneSecondRecords.length + parseResult.phoenixRecords.length;
    console.log('[v48] Stored ' + parseResult.oneSecondRecords.length + ' A0 + ' + parseResult.phoenixRecords.length + ' D1 + ' + (_lastAllRecords.length - totalRecords) + ' other records in main process, customer=' + _lastCustomer + ' runId=' + _lastRunId);

    return {
      success: true,
      partitions: allData.map(function(p) { return { partition: p.partition, size: p.size, chunksRead: p.chunksRead }; }),
      totalPartitions: numPartitions,
      partitionInfo: [],
      partitionDebug: partitionDebug,
      chunkReadDebug: chunkReadDebug,
      parseDebug: parseResult.debug || [],
      // Summary info (lightweight)
      recordCount: totalRecords,
      a0Count: parseResult.oneSecondRecords.length,
      d1Count: parseResult.phoenixRecords.length,
      totalBytes: allData.reduce(function(s, p) { return s + p.size; }, 0)
    };
  } catch (error) {
    READ_TIMEOUT = savedTimeout;
    try { await this.sendAckCommand(CMD.MEMORY_DUMP_END); } catch(e) {}
    return { success: false, error: error.message, partitions: [], totalPartitions: 0, partitionInfo: [], partitionDebug: [], chunkReadDebug: chunkReadDebug };
  }
};

// Get stored parsed records (for pagination)
ProcyonUsbBridge.prototype.getParsedRecords = function(offset, limit) {
  if (!_lastParsedRecords) return { records: [], total: 0 };
  var start = offset || 0;
  var end = Math.min(start + (limit || 100), _lastParsedRecords.length);
  return {
    records: _lastParsedRecords.slice(start, end),
    total: _lastParsedRecords.length
  };
};

// Export stored records as CSV string (single combined CSV for backward compat)
ProcyonUsbBridge.prototype.exportRecordsCsv = function() {
  if (!_lastParsedRecords || _lastParsedRecords.length === 0) return '';

  var headers = ['Time', 'Temperature(C)', 'BatteryV',
    'RpmMinX', 'RpmMaxX', 'RpmAvgX', 'RpmRmsX',
    'RpmMinY', 'RpmMaxY', 'RpmAvgY', 'RpmRmsY',
    'RpmMinZ', 'RpmMaxZ', 'RpmAvgZ', 'RpmRmsZ',
    'ShockLowMinX', 'ShockLowMaxX', 'ShockLowAvgX', 'ShockLowRmsX',
    'ShockLowMinY', 'ShockLowMaxY', 'ShockLowAvgY', 'ShockLowRmsY',
    'ShockLowMinZ', 'ShockLowMaxZ', 'ShockLowAvgZ', 'ShockLowRmsZ',
    'ShockMinX', 'ShockMaxX', 'ShockAvgX', 'ShockRmsX',
    'ShockMinY', 'ShockMaxY', 'ShockAvgY', 'ShockRmsY',
    'ShockMinZ', 'ShockMaxZ', 'ShockAvgZ', 'ShockRmsZ',
    'ShockLateralMax', 'ShockLateralRms'];

  var lines = [headers.join(',')];
  for (var i = 0; i < _lastParsedRecords.length; i++) {
    var r = _lastParsedRecords[i];
    var d = new Date(r.timestamp);
    var timeStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
    var vals = [timeStr, r.temperature, r.batteryVoltage,
      r.rpmXMin, r.rpmXMax, r.rpmXAvg, r.rpmXRms,
      r.rpmYMin, r.rpmYMax, r.rpmYAvg, r.rpmYRms,
      r.rpmZMin, r.rpmZMax, r.rpmZAvg, r.rpmZRms,
      r.shockLowXMin, r.shockLowXMax, r.shockLowXAvg, r.shockLowXRms,
      r.shockLowYMin, r.shockLowYMax, r.shockLowYAvg, r.shockLowYRms,
      r.shockLowZMin, r.shockLowZMax, r.shockLowZAvg, r.shockLowZRms,
      r.shockXMin, r.shockXMax, r.shockXAvg, r.shockXRms,
      r.shockYMin, r.shockYMax, r.shockYAvg, r.shockYRms,
      r.shockZMin, r.shockZMax, r.shockZAvg, r.shockZRms,
      r.shockLateralMax, r.shockLateralRms];
    lines.push(vals.join(','));
  }
  return lines.join('\n');
};

// Export all records in Procyon.exe format (main.csv + per-type CSVs as strings)
ProcyonUsbBridge.prototype.exportAllRecordsCsv = function() {
  if (!_lastAllRecords || _lastAllRecords.length === 0) return {};

  var result = {
    mainCsv: generateMainCsv(_lastAllRecords),
    typeCsvs: {}
  };

  var chainTypes = [0xA0, 0xD1, 0x80, 0x84, 0x90, 0x91];
  var chainNames = { 0xA0: 'OneSecondData', 0xD1: 'PhoenixOneSecondData', 0x80: 'RpmAxialWaveform', 0x84: 'FilteredRpmWaveform', 0x90: 'AccelWaveform', 0x91: 'LowShockWaveform' };

  for (var ti = 0; ti < chainTypes.length; ti++) {
    var ct = chainTypes[ti];
    var csv = generateTypeCsv(_lastAllRecords, ct);
    if (csv && csv.length > 0) {
      var key = '0x' + ct.toString(16).toLowerCase() + '_' + chainNames[ct];
      result.typeCsvs[key] = csv;
    }
  }

  return result;
};

ProcyonUsbBridge.prototype.saveRecordsCsv = async function(defaultPath) {
  if (!_lastAllRecords || _lastAllRecords.length === 0) {
    return { success: false, error: 'No records to export. Download data first.' };
  }
  var cust = (_lastCustomer || 'DRS').replace(/[^a-zA-Z0-9_-]/g, '_');
  var runId = (_lastRunId || '1').replace(/[^a-zA-Z0-9_-]/g, '_');
  try {
    var fs = require('fs');
    var path = require('path');
    var os = require('os');
    var dialog = require('electron').dialog || null;

    var downloadsDir = path.join(os.homedir(), 'Downloads');
    var saveDir = downloadsDir;

    if (dialog && dialog.showOpenDialog) {
      try {
        var result = await dialog.showOpenDialog({
          title: 'Select folder to save downloaded files',
          defaultPath: downloadsDir,
          properties: ['openDirectory', 'createDirectory']
        });
        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
          saveDir = result.filePaths[0];
        }
      } catch(e) {}
    }

    var now = new Date();
    var dateStr = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    var timeStr = String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');

    var savedFiles = [];

    // --- Save .pcmbin raw binary files (one per partition) ---
    if (_lastPartitionData && _lastPartitionData.length > 0) {
      for (var pi = 0; pi < _lastPartitionData.length; pi++) {
        var pd = _lastPartitionData[pi];
        var pcmbinName = 'PCM_' + cust + '_' + runId + '_' + dateStr + ' - ' + timeStr + '._P' + (pd.partition + 1) + '.pcmbin';
        var pcmbinPath = path.join(saveDir, pcmbinName);
        fs.writeFileSync(pcmbinPath, pd.data);
        savedFiles.push('.pcmbin: ' + pcmbinPath);
        console.log('[v48] Saved ' + pcmbinPath + ' (' + pd.data.length + ' bytes)');
      }
    }

    // --- Generate main.csv (record index, Procyon.exe format) ---
    var mainCsv = generateMainCsv(_lastAllRecords);
    var mainCsvName = 'PCM_' + cust + '_' + runId + '_' + dateStr + ' - ' + timeStr + '._P1.pcmbin.main.csv';
    var mainCsvPath = path.join(saveDir, mainCsvName);
    fs.writeFileSync(mainCsvPath, mainCsv, 'utf-8');
    savedFiles.push('main.csv: ' + mainCsvPath);

    // --- Generate per-type CSV files for csv_chain records ---
    var chainTypes = [0xA0, 0xD1, 0x80, 0x84, 0x90, 0x91];
    var chainNames = { 0xA0: 'OneSecondData', 0xD1: 'PhoenixOneSecondData', 0x80: 'RpmAxialWaveform', 0x84: 'FilteredRpmWaveform', 0x90: 'AccelWaveform', 0x91: 'LowShockWaveform' };

    for (var ti = 0; ti < chainTypes.length; ti++) {
      var ct = chainTypes[ti];
      var typeCsv = generateTypeCsv(_lastAllRecords, ct);
      if (typeCsv && typeCsv.length > 0) {
        var typeHex = '0x' + ct.toString(16).toLowerCase();
        var typeName = chainNames[ct] || ('type_' + ct.toString(16));
        var csvName = 'PCM_' + cust + '_' + runId + '_' + dateStr + ' - ' + timeStr + '._P1.pcmbin.' + typeHex + '_' + typeName + '.csv';
        var csvPath = path.join(saveDir, csvName);
        fs.writeFileSync(csvPath, typeCsv, 'utf-8');
        savedFiles.push(typeHex + '_' + typeName + '.csv: ' + csvPath);
        console.log('[v48] Saved ' + csvPath);
      }
    }

    console.log('[v48] Output files saved: ' + savedFiles.join(', '));
    var totalRecords = _lastParsedRecords.length + _lastPhoenixRecords.length;
    return { success: true, filePaths: savedFiles, recordCount: totalRecords, saveDir: saveDir };
  } catch (e) {
    return { success: false, error: e.message };
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

    // Enter test mode - use raw byte 0x01, not ASCII '1'
    var setModeResp = await this.sendCommand(CMD.SET_SELF_TEST_MODE, [0x01]);
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
          // DLL: StartVerificationAsync -> GetValueFromResponseAsync((Command)84, null) - no data
          var startResp = await this.sendCommand(CMD.START_VERIFICATION);
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
    await this.sendCommand(CMD.SET_SELF_TEST_MODE, [0x00]);

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
    try { await this.sendCommand(CMD.SET_SELF_TEST_MODE, [0x00]); } catch(e) {}
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
    
    // Temperature and Battery use dedicated functions that work
    var tempResult = await this.getTemperature();
    if (tempResult && tempResult.success) {
      sensorData.temperatureCM = String(tempResult.temperature !== undefined ? tempResult.temperature.toFixed(3) : '');
    } else {
      sensorData.temperatureCM = 'N/A';
    }
    
    var battResult = await this.getBatteryVoltage();
    if (battResult && battResult.success) {
      sensorData.batteryVoltage = String(battResult.rawMv !== undefined ? battResult.rawMv : (battResult.voltage !== undefined ? battResult.voltage : ''));
    } else {
      sensorData.batteryVoltage = 'N/A';
    }

    // Multi-value sensor GET commands (DLL-confirmed CMD codes and response formats)
    // All use IsLengthPreDetermined=True, so response length is known
    var multiSensors = {
      rotational: { cmd: CMD.GET_ROTATIONAL_DATA_CM, rl: 52, type: 'f32x12',
        fields: ['rpmX_min','rpmX_max','rpmX_avg','rpmX_rms','rpmY_min','rpmY_max','rpmY_avg','rpmY_rms','rpmZ_min','rpmZ_max','rpmZ_avg','rpmZ_rms'] },
      lowShock: { cmd: CMD.GET_LOWSHOCK_DATA_CM, rl: 52, type: 'f32x12',
        fields: ['lowShockX_min','lowShockX_max','lowShockX_avg','lowShockX_rms','lowShockY_min','lowShockY_max','lowShockY_avg','lowShockY_rms','lowShockZ_min','lowShockZ_max','lowShockZ_avg','lowShockZ_rms'] },
      highShock: { cmd: CMD.GET_HIGHSHOCK_DATA_CM, rl: 52, type: 'f32x12',
        fields: ['highShockX_min','highShockX_max','highShockX_avg','highShockX_rms','highShockY_min','highShockY_max','highShockY_avg','highShockY_rms','highShockZ_min','highShockZ_max','highShockZ_avg','highShockZ_rms'] },
      pressure: { cmd: CMD.GET_PRESSURE_DATA_CM, rl: 16, type: 'f32x3',
        fields: ['psi_min','psi_max','psi_avg'] },
    };

    var sensorKeys = Object.keys(multiSensors);
    for (var i = 0; i < sensorKeys.length; i++) {
      var sKey = sensorKeys[i];
      var sInfo = multiSensors[sKey];
      try {
        var resp = await this.sendCommand(sInfo.cmd, []);
        if (resp && resp.success && resp.data && resp.data.length >= 4) {
          // Parse Float32 values from response data (after 4-byte cmd header already stripped)
          var values = [];
          var numFloats = sInfo.fields.length;
          for (var fi = 0; fi < numFloats; fi++) {
            var offset = fi * 4;
            if (offset + 4 <= resp.data.length) {
              var buf = Buffer.from(resp.data.slice(offset, offset + 4));
              values.push(buf.readFloatLE(0));
            } else {
              values.push(NaN);
            }
          }
          // Store each field individually
          for (var vi = 0; vi < sInfo.fields.length; vi++) {
            var fieldName = sInfo.fields[vi];
            sensorData[fieldName] = isNaN(values[vi]) ? 'N/A' : values[vi].toFixed(3);
          }
        } else {
          // Mark all fields as N/A
          for (var ni = 0; ni < sInfo.fields.length; ni++) {
            sensorData[sInfo.fields[ni]] = 'N/A';
          }
        }
      } catch (e) {
        for (var ei = 0; ei < sInfo.fields.length; ei++) {
          sensorData[sInfo.fields[ei]] = 'N/A';
        }
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
