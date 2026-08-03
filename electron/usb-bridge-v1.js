/**
 * UDL (Unified Data Logger) USB Bridge -- libusb-1.0.dll FFI implementation
 * VERSION: 2024-06-29-v1 (initial implementation)
 *
 * Uses koffi to call libusb-1.0.dll directly.
 * Supports new UDL protocol with CM/EM/Retina/RetinaMini devices.
 *
 * Device: VID=0x2269, PID=0xBEEF (same as legacy)
 * Driver: libusb-1.0 (WinUSB or libusbK)
 * Transfer: USB Bulk, EP1 OUT=0x01, EP1 IN=0x81, 64 bytes max packet
 * Interface: 1
 */

var koffi;
try {
  koffi = require('koffi');
  console.log('[USB1] koffi loaded successfully');
} catch (e) {
  console.error('[USB1] FATAL: koffi not found. Run: pnpm add koffi');
  module.exports = { supported: false, error: 'koffi not installed' };
  return;
}

var PROCYON_VID = 0x2269;
var PROCYON_PID = 0xBEEF;
var EP_OUT = 0x01;
var EP_IN = 0x81;
var WRITE_TIMEOUT = 1000;
var READ_TIMEOUT = 200;
var INTERFACE_NUMBER = 1;

// =====================================================
// libusb-1.0.dll FFI definitions
// =====================================================

var lib1;
var supported = false;
var loadError = null;

try {
  // Search for libusb-1.0.dll in multiple locations
  var dllPaths = [
    'libusb-1.0.dll',  // Current directory (project root)
    require('path').join(process.cwd(), 'libusb-1.0.dll'),
    'C:\\Program Files\\Unified Data Logger\\libusb-1.0.dll',
    'C:\\Program Files (x86)\\Unified Data Logger\\libusb-1.0.dll',
  ];

  console.log('[USB1] Searching for libusb-1.0.dll...');
  var fs = require('fs');
  var path = require('path');

  var loadedPath = null;
  for (var i = 0; i < dllPaths.length; i++) {
    var dllPath = dllPaths[i];
    console.log('[USB1] Trying: ' + dllPath);
    try {
      var exists = fs.existsSync(dllPath);
      console.log('[USB1]   File exists: ' + exists);
      if (exists) {
        lib1 = koffi.load(dllPath);
        loadedPath = dllPath;
        console.log('[USB1] libusb-1.0.dll loaded successfully from: ' + dllPath);
        break;
      }
    } catch (e) {
      console.log('[USB1]   Load failed: ' + e.message);
    }
  }

  if (!lib1) {
    throw new Error('libusb-1.0.dll not found in any location');
  }

  // --- Struct definitions ---
  // libusb_device_descriptor (18 bytes)
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
  console.log('[USB1] libusb_device_descriptor defined OK');

  // Opaque pointer types
  var _opaque = koffi.opaque('_opaque');
  var opaque_ptr = koffi.pointer(_opaque);

  // --- Function declarations ---
  // libusb_init: int libusb_init(libusb_context **ctx)
  var fn_init = lib1.func('libusb_init', 'int', ['void **']);
  // libusb_exit: void libusb_exit(libusb_context *ctx)
  var fn_exit = lib1.func('libusb_exit', 'void', ['void *']);
  // libusb_get_device_list: ssize_t libusb_get_device_list(libusb_context *ctx, libusb_device ***list)
  var fn_get_device_list = lib1.func('libusb_get_device_list', 'int', ['void *', 'void ***']);
  // libusb_free_device_list: void libusb_free_device_list(libusb_device **list, int unref_devices)
  var fn_free_device_list = lib1.func('libusb_free_device_list', 'void', ['void **', 'int']);
  // libusb_get_device_descriptor: int libusb_get_device_descriptor(libusb_device *dev, struct libusb_device_descriptor *desc)
  var fn_get_device_descriptor = lib1.func('libusb_get_device_descriptor', 'int', ['void *', 'void *']);
  // libusb_open: int libusb_open(libusb_device *dev, libusb_device_handle **devh)
  var fn_open = lib1.func('libusb_open', 'int', ['void *', 'void **']);
  // libusb_close: void libusb_close(libusb_device_handle *devh)
  var fn_close = lib1.func('libusb_close', 'void', ['void *']);
  // libusb_claim_interface: int libusb_claim_interface(libusb_device_handle *devh, int interface_number)
  var fn_claim_interface = lib1.func('libusb_claim_interface', 'int', ['void *', 'int']);
  // libusb_release_interface: int libusb_release_interface(libusb_device_handle *devh, int interface_number)
  var fn_release_interface = lib1.func('libusb_release_interface', 'int', ['void *', 'int']);
  // libusb_set_configuration: int libusb_set_configuration(libusb_device_handle *devh, int configuration)
  var fn_set_configuration = lib1.func('libusb_set_configuration', 'int', ['void *', 'int']);
  // libusb_bulk_transfer: int libusb_bulk_transfer(libusb_device_handle *devh, uint8_t endpoint, unsigned char *data, int length, int *transferred, unsigned int timeout)
  var fn_bulk_transfer = lib1.func('libusb_bulk_transfer', 'int', [
    'void *',  // dev_handle
    'uint8',   // endpoint
    'void *',  // data
    'int',     // length
    'int *',   // transferred (output)
    'uint'     // timeout (ms)
  ]);
  // libusb_clear_halt: int libusb_clear_halt(libusb_device_handle *devh, uint8_t endpoint)
  var fn_clear_halt = lib1.func('libusb_clear_halt', 'int', ['void *', 'uint8']);
  // libusb_reset_device: int libusb_reset_device(libusb_device_handle *devh)
  var fn_reset_device = lib1.func('libusb_reset_device', 'int', ['void *']);
  // libusb_error_name: const char *libusb_error_name(int errcode)
  var fn_error_name = lib1.func('libusb_error_name', 'str', ['int']);
  // libusb_strerror: const char *libusb_strerror(enum libusb_error errcode)
  var fn_strerror = lib1.func('libusb_strerror', 'str', ['int']);

  console.log('[USB1] All libusb-1.0 functions bound OK');
  supported = true;

} catch (e) {
  console.error('[USB1] Failed to load libusb-1.0 bridge: ' + e.message);
  loadError = e.message;
  supported = false;
}

// =====================================================
// UDL Bridge Class
// =====================================================

function UdlUsbBridge() {
  this.ctx = null;
  this.devHandle = null;
  this.connected = false;
  this.deviceInfo = null;
}

UdlUsbBridge.prototype.isConnected = function() {
  return this.connected;
};

UdlUsbBridge.prototype.getBridgeInfo = function() {
  return {
    type: 'udl',
    name: 'UDL Bridge (libusb-1.0)',
    version: '2024-06-29-v1',
    supported: supported,
    error: loadError,
  };
};

UdlUsbBridge.prototype.init = function() {
  if (!supported) return { success: false, error: 'libusb-1.0.dll not loaded' };

  try {
    console.log('[USB1] Initializing libusb-1.0...');
    var ctxPtr = koffi.alloc('void *', 8);
    var ret = fn_init(ctxPtr);
    if (ret < 0) {
      console.error('[USB1] libusb_init failed: ' + fn_error_name(ret));
      return { success: false, error: 'libusb_init failed: ' + fn_error_name(ret) };
    }
    this.ctx = ctxPtr;
    console.log('[USB1] libusb-1.0 initialized');
    return { success: true };
  } catch (e) {
    console.error('[USB1] init error: ' + e.message);
    return { success: false, error: e.message };
  }
};

UdlUsbBridge.prototype.listDevices = function() {
  if (!this.ctx) {
    var initResult = this.init();
    if (!initResult.success) return [];
  }

  try {
    var listPtr = koffi.alloc('void **', 8);
    var count = fn_get_device_list(this.ctx, listPtr);
    if (count < 0) {
      console.error('[USB1] libusb_get_device_list failed: ' + fn_error_name(count));
      return [];
    }

    console.log('[USB1] Found ' + count + ' USB devices');

    var devices = [];
    var descriptorBuf = Buffer.alloc(18);

    // Decode the device list pointer
    var devList = koffi.decode(listPtr, 'void **');
    if (!devList || !devList[0]) {
      fn_free_device_list(listPtr, 0);
      return [];
    }

    for (var i = 0; i < count; i++) {
      var devPtr = devList[i];
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

    fn_free_device_list(listPtr, 0);
    return devices;
  } catch (e) {
    console.error('[USB1] listDevices error: ' + e.message);
    return [];
  }
};

UdlUsbBridge.prototype.connect = function(devicePath) {
  if (!this.ctx) {
    var initResult = this.init();
    if (!initResult.success) return Promise.resolve(initResult);
  }

  try {
    console.log('[USB1] Scanning for Procyon CM device...');
    var devices = this.listDevices();

    var targetDev = null;
    for (var i = 0; i < devices.length; i++) {
      var dev = devices[i];
      if (dev.vid === PROCYON_VID && dev.pid === PROCYON_PID) {
        targetDev = dev;
        break;
      }
    }

    if (!targetDev) {
      console.error('[USB1] Procyon CM not found (VID=0x' + PROCYON_VID.toString(16) + ', PID=0x' + PROCYON_PID.toString(16) + ')');
      return Promise.resolve({ success: false, error: 'Procyon CM not found' });
    }

    console.log('[USB1] Found Procyon CM! Opening device...');

    // Open device
    var handlePtr = koffi.alloc('void *', 8);
    var ret = fn_open(targetDev._devicePtr, handlePtr);
    if (ret < 0) {
      console.error('[USB1] libusb_open failed: ' + fn_error_name(ret));
      return Promise.resolve({ success: false, error: 'libusb_open failed: ' + fn_error_name(ret) });
    }

    this.devHandle = handlePtr;
    console.log('[USB1] Device opened successfully');

    // Set configuration
    ret = fn_set_configuration(this.devHandle, 1);
    if (ret < 0 && ret !== -6) { // -6 = LIBUSB_ERROR_BUSY (already configured)
      console.error('[USB1] libusb_set_configuration failed: ' + fn_error_name(ret));
      return Promise.resolve({ success: false, error: 'libusb_set_configuration failed: ' + fn_error_name(ret) });
    }
    console.log('[USB1] Configuration set');

    // Claim interface
    ret = fn_claim_interface(this.devHandle, INTERFACE_NUMBER);
    if (ret < 0) {
      console.error('[USB1] libusb_claim_interface failed: ' + fn_error_name(ret));
      return Promise.resolve({ success: false, error: 'libusb_claim_interface failed: ' + fn_error_name(ret) });
    }
    console.log('[USB1] Interface ' + INTERFACE_NUMBER + ' claimed');

    this.connected = true;
    this.deviceInfo = {
      vid: targetDev.vid,
      pid: targetDev.pid,
      bcdUSB: targetDev.bcdUSB,
      bDeviceClass: targetDev.bDeviceClass,
      iManufacturer: targetDev.iManufacturer,
      iProduct: targetDev.iProduct,
      iSerialNumber: targetDev.iSerialNumber,
    };

    console.log('[USB1] Connected to Procyon CM (UDL mode)');
    return Promise.resolve({ success: true, deviceInfo: this.deviceInfo });
  } catch (e) {
    console.error('[USB1] connect error: ' + e.message);
    return Promise.resolve({ success: false, error: e.message });
  }
};

UdlUsbBridge.prototype.disconnect = function() {
  if (this.devHandle) {
    try {
      fn_release_interface(this.devHandle, INTERFACE_NUMBER);
      fn_close(this.devHandle);
    } catch (e) {
      console.error('[USB1] disconnect error: ' + e.message);
    }
    this.devHandle = null;
  }

  if (this.ctx) {
    try {
      fn_exit(this.ctx);
    } catch (e) {
      console.error('[USB1] exit error: ' + e.message);
    }
    this.ctx = null;
  }

  this.connected = false;
  this.deviceInfo = null;
  console.log('[USB1] Disconnected');
  return Promise.resolve({ success: true });
};

UdlUsbBridge.prototype.sendCommand = function(cmdCode, data) {
  if (!this.connected || !this.devHandle) {
    return Promise.resolve({ success: false, error: 'Not connected' });
  }

  return new Promise((resolve) => {
    try {
      var cmdLow = cmdCode & 0xFF;
      var cmdHigh = (cmdCode >> 8) & 0xFF;
      var length = data ? data.length : 0;
      var lengthLow = length & 0xFF;
      var lengthHigh = (length >> 8) & 0xFF;

      var packet = Buffer.alloc(4 + length);
      packet[0] = cmdLow;
      packet[1] = cmdHigh;
      packet[2] = lengthLow;
      packet[3] = lengthHigh;
      if (data) {
        for (var i = 0; i < length; i++) {
          packet[4 + i] = data[i];
        }
      }

      console.log('[USB1] Sending: ' + packet.toString('hex'));

      var transferred = koffi.alloc('int', 4);
      var ret = fn_bulk_transfer(this.devHandle, EP_OUT, packet, packet.length, transferred, WRITE_TIMEOUT);

      if (ret < 0) {
        console.error('[USB1] Write failed: ' + fn_error_name(ret));
        resolve({ success: false, error: 'Write failed: ' + fn_error_name(ret) });
        return;
      }

      console.log('[USB1] Written ' + transferred[0] + ' bytes');

      // Read response
      var responseBuf = Buffer.alloc(4096);
      transferred = koffi.alloc('int', 4);
      ret = fn_bulk_transfer(this.devHandle, EP_IN, responseBuf, responseBuf.length, transferred, READ_TIMEOUT);

      if (ret < 0) {
        console.error('[USB1] Read failed: ' + fn_error_name(ret));
        resolve({ success: false, error: 'Read failed: ' + fn_error_name(ret) });
        return;
      }

      var response = responseBuf.slice(0, transferred[0]);
      console.log('[USB1] Received: ' + response.toString('hex'));

      resolve({ success: true, data: response });
    } catch (e) {
      console.error('[USB1] sendCommand error: ' + e.message);
      resolve({ success: false, error: e.message });
    }
  });
};

// =====================================================
// Exports
// =====================================================

module.exports = {
  supported: supported,
  error: loadError,
  UdlUsbBridge: UdlUsbBridge,
  PROCYON_VID: PROCYON_VID,
  PROCYON_PID: PROCYON_PID,
};
