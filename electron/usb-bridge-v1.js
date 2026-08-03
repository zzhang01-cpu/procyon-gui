/**
 * libusb-1.0 FFI Bridge for Unified Data Logger v8+ devices
 *
 * Uses koffi to call libusb-1.0.dll directly.
 * Supports new UDL firmware devices alongside legacy Procyon devices.
 *
 * Device detection:
 * - Auto-detects libusb-1.0 compatible devices
 * - Supports multiple device types: CM, EM, Retina, RetinaMini
 *
 * NOTE: No template literals to avoid GBK encoding corruption on Windows.
 */

var koffi;
try {
  koffi = require('koffi');
} catch (e) {
  module.exports = { supported: false, error: 'koffi not installed' };
  return;
}

var lib1;
var loaded = false;
var initDone = false;

// Try to load libusb-1.0.dll from multiple locations
var path = require('path');
var fs = require('fs');
var dllPaths = [
  'libusb-1.0.dll',  // Current directory
  path.join(__dirname, '..', 'libusb-1.0.dll'),  // Project root
  path.join(__dirname, 'libusb-1.0.dll'),  // electron/ directory
  'C:\\Program Files\\Unified Data Logger\\libusb-1.0.dll',  // UDL install directory
  'C:\\Windows\\System32\\libusb-1.0.dll',  // System directory
];

console.log('[USB1] Searching for libusb-1.0.dll...');
var loadError = null;
for (var i = 0; i < dllPaths.length; i++) {
  var dllPath = dllPaths[i];
  console.log('[USB1] Trying: ' + dllPath);
  
  // Check if file exists
  try {
    var exists = fs.existsSync(dllPath);
    console.log('[USB1]   File exists: ' + exists);
    if (!exists) continue;
  } catch (e) {
    console.log('[USB1]   Error checking file: ' + e.message);
    continue;
  }
  
  try {
    lib1 = koffi.load(dllPath);
    loaded = true;
    console.log('[USB1] libusb-1.0.dll loaded successfully from: ' + dllPath);
    break;
  } catch (e) {
    loadError = e.message;
    console.log('[USB1]   Load failed: ' + e.message);
  }
}

if (!loaded) {
  console.log('[USB1] libusb-1.0.dll not available: ' + loadError);
  module.exports = { supported: false, error: 'libusb-1.0.dll not found' };
  return;
}

// =====================================================
// libusb-1.0 FFI definitions
// =====================================================

// Opaque types
var libusb_context_ptr = koffi.pointer(koffi.opaque('libusb_context'));
var libusb_device_handle_ptr = koffi.pointer(koffi.opaque('libusb_device_handle'));
var libusb_device_ptr = koffi.pointer(koffi.opaque('libusb_device'));
var libusb_device_descriptor_struct = null;

// Device descriptor struct
var libusb_device_descriptor = koffi.struct('libusb_device_descriptor', {
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

// Device list is an array of pointers
// libusb_device *** is output parameter, but we use pointer to pointer array

// Function declarations (libusb-1.0 API)
var fn_init = lib1.func('libusb_init', 'int', ['void**']);
var fn_exit = lib1.func('libusb_exit', 'void', [libusb_context_ptr]);
var fn_get_device_list = lib1.func('libusb_get_device_list', 'int', [libusb_context_ptr, 'void**']);
var fn_free_device_list = lib1.func('libusb_free_device_list', 'void', [libusb_context_ptr, 'void*', 'int']);
var fn_get_device_descriptor = lib1.func('libusb_get_device_descriptor', 'int', [libusb_device_ptr, 'void*']);
var fn_open = lib1.func('libusb_open', 'int', [libusb_device_ptr, 'void**']);
var fn_close = lib1.func('libusb_close', 'void', [libusb_device_handle_ptr]);
var fn_claim_interface = lib1.func('libusb_claim_interface', 'int', [libusb_device_handle_ptr, 'int']);
var fn_release_interface = lib1.func('libusb_release_interface', 'int', [libusb_device_handle_ptr, 'int']);
var fn_set_configuration = lib1.func('libusb_set_configuration', 'int', [libusb_device_handle_ptr, 'int']);
var fn_bulk_transfer = lib1.func('libusb_bulk_transfer', 'int', [
  libusb_device_handle_ptr,  // dev_handle
  'uint8',                    // endpoint
  'void*',                    // data
  'int',                      // length
  'int*',                     // transferred (output)
  'uint'                      // timeout (ms)
]);
var fn_clear_halt = lib1.func('libusb_clear_halt', 'int', [libusb_device_handle_ptr, 'uint8']);
var fn_reset_device = lib1.func('libusb_reset_device', 'int', [libusb_device_handle_ptr]);
var fn_error_name = lib1.func('libusb_error_name', 'str', ['int']);
var fn_strerror = lib1.func('libusb_strerror', 'str', ['int']);

// libusb_context instance
var ctx = null;

function ensureInit() {
  if (initDone) return;
  var ctxPtr = Buffer.alloc(koffi.sizeof('pointer'));
  var ret = fn_init(ctxPtr);
  if (ret < 0) {
    console.error('[USB1] libusb_init failed: ' + fn_error_name(ret));
    return;
  }
  // Read the context pointer from the output buffer
  ctx = koffi.decode(ctxPtr, 'pointer');
  initDone = true;
  console.log('[USB1] libusb-1.0 initialized');
}

// =====================================================
// Device discovery
// =====================================================

/**
 * Scan all USB devices and return those matching known VID/PIDs.
 * Returns array of {vid, pid, bus, address, devicePtr}
 */
function listDevices() {
  ensureInit();
  if (!ctx) return [];

  var listPtrBuf = Buffer.alloc(koffi.sizeof('pointer'));
  var count = fn_get_device_list(ctx, listPtrBuf);
  if (count < 0) {
    console.error('[USB1] libusb_get_device_list failed: ' + fn_error_name(count));
    return [];
  }

  var listPtr = koffi.decode(listPtrBuf, 'pointer');
  if (!listPtr) return [];

  var devices = [];
  var descriptorBuf = Buffer.alloc(18); // libusb_device_descriptor is 18 bytes

  for (var i = 0; i < count; i++) {
    // Calculate pointer to device pointer at index i
    var devPtrAddrBuf = Buffer.alloc(koffi.sizeof('pointer'));
    // Copy from listPtr + i * pointer_size
    // We need to read the pointer at listPtr[i]
    var listArr = koffi.decode(listPtr, koffi.array(koffi.pointer(koffi.opaque('dev')), count));
    var devPtr = listArr[i];
    if (!devPtr) continue;

    var ret = fn_get_device_descriptor(devPtr, descriptorBuf);
    if (ret < 0) continue;

    var desc = koffi.decode(descriptorBuf, libusb_device_descriptor);
    devices.push({
      vid: desc.idVendor,
      pid: desc.idProduct,
      bcdUSB: desc.bcdUSB,
      bDeviceClass: desc.bDeviceClass,
      bDeviceSubClass: desc.bDeviceSubClass,
      bDeviceProtocol: desc.bDeviceProtocol,
      iManufacturer: desc.iManufacturer,
      iProduct: desc.iProduct,
      iSerialNumber: desc.iSerialNumber,
      bNumConfigurations: desc.bNumConfigurations,
      _devicePtr: devPtr,
    });
  }

  // Don't free the list yet - we need device pointers
  // Caller must call freeDeviceList when done
  return { devices: devices, listPtr: listPtr, count: count };
}

function freeDeviceList(listPtr) {
  if (listPtr) {
    fn_free_device_list(ctx, listPtr, 1);
  }
}

// =====================================================
// Known device VIDs/PIDs
// =====================================================

// Legacy Procyon VID/PID
var KNOWN_DEVICES = [
  { vid: 0x2269, pid: 0xBEEF, name: 'Procyon CM (legacy)', type: 'CM' },
  // Add new UDL VID/PIDs here as they are discovered
  // { vid: 0xXXXX, pid: 0xYYYY, name: 'Unified Data Logger CM', type: 'CM' },
];

function findKnownDevices() {
  var result = listDevices();
  if (!result || !result.devices) {
    if (result && result.listPtr) freeDeviceList(result.listPtr);
    return [];
  }

  var matched = [];
  for (var i = 0; i < result.devices.length; i++) {
    var dev = result.devices[i];
    for (var j = 0; j < KNOWN_DEVICES.length; j++) {
      var kd = KNOWN_DEVICES[j];
      if (dev.vid === kd.vid && dev.pid === kd.pid) {
        matched.push({
          vid: dev.vid,
          pid: dev.pid,
          name: kd.name,
          type: kd.type,
          _devicePtr: dev._devicePtr,
        });
      }
    }
  }

  // Store listPtr for later use (don't free yet - caller will use devicePtr)
  return { devices: matched, listPtr: result.listPtr };
}

// =====================================================
// UDL USB Bridge (libusb-1.0)
// =====================================================

function UdlUsbBridge(deviceInfo) {
  this.handle = null;
  this.connected = false;
  this.deviceInfo = deviceInfo || null;
  this.interfaceClaimed = -1;
  this._listPtr = null;
}

UdlUsbBridge.prototype.connect = async function(options) {
  var self = this;
  if (self.connected) {
    return { success: true, message: 'Already connected' };
  }

  try {
    ensureInit();
    if (!ctx) {
      return { success: false, error: 'libusb-1.0 not initialized' };
    }

    var interfaceNum = (options && options.interface !== undefined) ? options.interface : 0;
    var epOut = (options && options.epOut !== undefined) ? options.epOut : 0x01;
    var epIn = (options && options.epIn !== undefined) ? options.epIn : 0x81;

    var devPtr = null;
    var listPtr = null;

    if (self.deviceInfo && self.deviceInfo._devicePtr) {
      devPtr = self.deviceInfo._devicePtr;
    } else {
      // Auto-detect
      var result = findKnownDevices();
      if (!result || result.devices.length === 0) {
        if (result && result.listPtr) freeDeviceList(result.listPtr);
        return { success: false, error: 'No known USB devices found' };
      }
      devPtr = result.devices[0]._devicePtr;
      self.deviceInfo = result.devices[0];
      listPtr = result.listPtr;
    }

    // Open device
    var handleBuf = Buffer.alloc(koffi.sizeof('pointer'));
    var ret = fn_open(devPtr, handleBuf);
    if (ret < 0) {
      if (listPtr) freeDeviceList(listPtr);
      return { success: false, error: 'libusb_open failed: ' + fn_error_name(ret) };
    }

    self.handle = koffi.decode(handleBuf, 'pointer');
    self._listPtr = listPtr;

    // Set configuration (1 = default)
    ret = fn_set_configuration(self.handle, 1);
    if (ret < 0) {
      console.log('[USB1] Warning: set_configuration returned ' + fn_error_name(ret));
      // Non-fatal - continue
    }

    // Claim interface
    ret = fn_claim_interface(self.handle, interfaceNum);
    if (ret < 0) {
      // Try interface 1 if interface 0 fails (like legacy)
      if (interfaceNum === 0) {
        ret = fn_claim_interface(self.handle, 1);
        if (ret < 0) {
          fn_close(self.handle);
          self.handle = null;
          if (listPtr) freeDeviceList(listPtr);
          return { success: false, error: 'Cannot claim interface 0 or 1: ' + fn_error_name(ret) };
        }
        interfaceNum = 1;
      } else {
        fn_close(self.handle);
        self.handle = null;
        if (listPtr) freeDeviceList(listPtr);
        return { success: false, error: 'Cannot claim interface ' + interfaceNum + ': ' + fn_error_name(ret) };
      }
    }

    self.interfaceClaimed = interfaceNum;
    self.connected = true;

    console.log('[USB1] Connected successfully (interface=' + interfaceNum + ')');
    return { success: true, message: 'Connected via libusb-1.0' };
  } catch (e) {
    console.error('[USB1] connect error: ' + e.message);
    return { success: false, error: e.message };
  }
};

UdlUsbBridge.prototype.disconnect = function() {
  var self = this;
  if (self.handle) {
    if (self.interfaceClaimed >= 0) {
      try { fn_release_interface(self.handle, self.interfaceClaimed); } catch (e) {}
      self.interfaceClaimed = -1;
    }
    try { fn_close(self.handle); } catch (e) {}
    self.handle = null;
  }
  if (self._listPtr) {
    try { freeDeviceList(self._listPtr); } catch (e) {}
    self._listPtr = null;
  }
  self.connected = false;
  self.deviceInfo = null;
  console.log('[USB1] Disconnected');
  return { success: true };
};

UdlUsbBridge.prototype.bulkWrite = function(endpoint, data, timeout) {
  var self = this;
  if (!self.handle || !self.connected) {
    return { success: false, error: 'Not connected' };
  }
  timeout = timeout || 1000;
  var transferredBuf = Buffer.alloc(4); // int
  var buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  var ret = fn_bulk_transfer(self.handle, endpoint, buf, buf.length, transferredBuf, timeout);
  var transferred = transferredBuf.readInt32LE(0);
  if (ret < 0) {
    return { success: false, error: 'bulk_write failed: ' + fn_error_name(ret), transferred: transferred };
  }
  return { success: true, transferred: transferred };
};

UdlUsbBridge.prototype.bulkRead = function(endpoint, length, timeout) {
  var self = this;
  if (!self.handle || !self.connected) {
    return { success: false, error: 'Not connected' };
  }
  timeout = timeout || 200;
  var buf = Buffer.alloc(length);
  var transferredBuf = Buffer.alloc(4);
  var ret = fn_bulk_transfer(self.handle, endpoint, buf, length, transferredBuf, timeout);
  var transferred = transferredBuf.readInt32LE(0);
  if (ret < 0) {
    return { success: false, error: 'bulk_read failed: ' + fn_error_name(ret), transferred: transferred, data: null };
  }
  return { success: true, transferred: transferred, data: buf.slice(0, transferred) };
};

UdlUsbBridge.prototype.clearHalt = function(endpoint) {
  var self = this;
  if (!self.handle) return false;
  var ret = fn_clear_halt(self.handle, endpoint);
  return ret >= 0;
};

// =====================================================
// Export
// =====================================================

module.exports = {
  supported: loaded,
  UdlUsbBridge: UdlUsbBridge,
  findKnownDevices: findKnownDevices,
  listDevices: listDevices,
  freeDeviceList: freeDeviceList,
  KNOWN_DEVICES: KNOWN_DEVICES,
  // For testing / debugging
  _lib: lib1,
  _ensureInit: ensureInit,
  _errorName: function(code) { return fn_error_name(code); },
};
