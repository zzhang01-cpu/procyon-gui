const usb = require('usb');

const PROCYON_VID = 0x2269;
const PROCYON_PID = 0xBEEF;

class ProcyonUsbBridge {
  constructor() {
    this.device = null;
    this.connected = false;
    this.iface = null;
    this.inEndpoint = null;
    this.outEndpoint = null;
    this.receiveBuffer = Buffer.alloc(0);
    this.dataCallback = null;
  }

  /**
   * List all USB devices
   */
  listDevices() {
    try {
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
      console.error('Failed to list USB devices:', error);
      return [];
    }
  }

  /**
   * Connect to Procyon device via USB using WebUSB-like API
   */
  async connect() {
    try {
      if (this.connected) {
        await this.disconnect();
      }

      // Use usb.findByIds for direct device lookup
      const device = usb.findByIds(PROCYON_VID, PROCYON_PID);
      if (!device) {
        return { success: false, error: 'Procyon device not found. Please check USB connection.' };
      }

      console.log('[USB] Found Procyon device, attempting to open...');

      // Open device - this must succeed before anything else
      try {
        device.open();
        console.log('[USB] Device opened successfully');
      } catch (openErr) {
        console.error('[USB] Failed to open device:', openErr.message);
        return { success: false, error: `Failed to open USB device: ${openErr.message}` };
      }

      this.device = device;

      // Get interface using device.interface(n) method
      // This is the standard node-usb API that works on Windows with WinUSB
      let iface = null;
      try {
        iface = device.interface(0);
        console.log('[USB] Got interface 0 via device.interface(0)');
      } catch (ifaceErr) {
        console.error('[USB] device.interface(0) failed:', ifaceErr.message);
        // Fallback: try device.interfaces property
        if (device.interfaces && device.interfaces.length > 0) {
          iface = device.interfaces[0];
          console.log('[USB] Got interface 0 via device.interfaces[0]');
        }
      }

      if (!iface) {
        try { device.close(); } catch(e) {}
        this.device = null;
        return { success: false, error: 'No USB interface found on device' };
      }

      // Try to detach kernel driver if active
      try {
        if (iface.isKernelDriverActive()) {
          console.log('[USB] Kernel driver is active, detaching...');
          iface.detachKernelDriver();
          console.log('[USB] Kernel driver detached');
        }
      } catch (detachErr) {
        // NOT_SUPPORTED is expected on Windows with WinUSB - this is OK
        console.log('[USB] Kernel driver check result:', detachErr.message);
      }

      // Claim the interface
      try {
        iface.claim();
        console.log('[USB] Successfully claimed interface 0');
      } catch (claimErr) {
        console.error('[USB] Failed to claim interface:', claimErr.message);

        // On Windows, LIBUSB_ERROR_NOT_FOUND can occur if the WinUSB driver
        // is not properly bound to the interface. Try alternative approaches.

        // Approach 1: Try with iface = device.interfaces[0] if we used interface(0) before
        if (device.interfaces && device.interfaces.length > 0 && iface !== device.interfaces[0]) {
          console.log('[USB] Trying device.interfaces[0] instead...');
          try {
            iface = device.interfaces[0];
            iface.claim();
            console.log('[USB] Claimed via device.interfaces[0]');
          } catch (retryErr) {
            console.error('[USB] Retry claim also failed:', retryErr.message);
            try { device.close(); } catch(e) {}
            this.device = null;
            return {
              success: false,
              error: `Failed to claim USB interface (${claimErr.message}).\n\nThis usually means the WinUSB driver is not properly installed.\n\nPlease follow these steps:\n1. Open Zadig\n2. Select Procyon-CM from dropdown\n3. Make sure driver is set to "WinUSB"\n4. Click "Replace Driver" or "Reinstall WCID Driver"\n5. Unplug and replug the USB cable\n6. Try again`
            };
          }
        } else {
          try { device.close(); } catch(e) {}
          this.device = null;
          return {
            success: false,
            error: `Failed to claim USB interface (${claimErr.message}).\n\nThis usually means the WinUSB driver is not properly installed.\n\nPlease follow these steps:\n1. Open Zadig\n2. Select Procyon-CM from dropdown\n3. Make sure driver is set to "WinUSB"\n4. Click "Replace Driver" or "Reinstall WCID Driver"\n5. Unplug and replug the USB cable\n6. Try again`
          };
        }
      }

      this.iface = iface;

      // Find endpoints
      const endpoints = iface.endpoints || [];
      console.log('[USB] Endpoints found:', endpoints.length);

      for (const ep of endpoints) {
        const epAddr = ep.address !== undefined ? `0x${ep.address.toString(16)}` : 
                       (ep.bEndpointAddress !== undefined ? `0x${ep.bEndpointAddress.toString(16)}` : 'unknown');
        console.log(`[USB] Endpoint: address=${epAddr} direction=${ep.direction} type=${ep.transferType}`);
        if (ep.direction === 'in') {
          this.inEndpoint = ep;
        } else if (ep.direction === 'out') {
          this.outEndpoint = ep;
        }
      }

      if (!this.inEndpoint || !this.outEndpoint) {
        this.iface.release(false, () => {});
        try { this.device.close(); } catch(e) {}
        this.device = null;
        return { 
          success: false, 
          error: `Could not find USB endpoints. IN: ${!!this.inEndpoint}, OUT: ${!!this.outEndpoint}` 
        };
      }

      // Start listening for incoming data
      this.inEndpoint.startPoll();
      this.inEndpoint.on('data', (data) => {
        this.handleData(data);
      });
      this.inEndpoint.on('error', (err) => {
        console.error('USB IN endpoint error:', err);
      });

      this.connected = true;
      console.log('[USB] Connection established successfully');
      return { success: true };
    } catch (error) {
      console.error('[USB] Connection error:', error);
      try {
        if (this.iface) { try { this.iface.release(false, () => {}); } catch(e) {} }
        if (this.device) { try { this.device.close(); } catch(e) {} }
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      this.device = null;
      this.iface = null;
      this.inEndpoint = null;
      this.outEndpoint = null;
      this.connected = false;
      return { success: false, error: `Connection error: ${error.message}` };
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect() {
    try {
      if (this.inEndpoint) {
        try {
          this.inEndpoint.stopPoll();
        } catch (e) {
          // Ignore
        }
        this.inEndpoint = null;
      }

      if (this.iface) {
        try {
          this.iface.release(false, () => {});
        } catch (e) {
          // Ignore
        }
        this.iface = null;
      }

      if (this.device) {
        try {
          this.device.close();
        } catch (e) {
          // Ignore
        }
        this.device = null;
      }

      this.outEndpoint = null;
      this.connected = false;
      this.receiveBuffer = Buffer.alloc(0);
      console.log('[USB] Disconnected');
      return { success: true };
    } catch (error) {
      console.error('[USB] Disconnect error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send command to device
   */
  async sendCommand(data) {
    if (!this.connected || !this.outEndpoint) {
      return { success: false, error: 'Device not connected' };
    }

    try {
      const buffer = Buffer.from(data);
      return new Promise((resolve, reject) => {
        this.outEndpoint.transfer(buffer, (err) => {
          if (err) {
            console.error('[USB] Send error:', err.message);
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Read data from device
   */
  async readData(timeout = 5000) {
    if (!this.connected || !this.inEndpoint) {
      return { success: false, error: 'Device not connected' };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ success: false, error: 'Read timeout' });
      }, timeout);

      const onData = (data) => {
        clearTimeout(timer);
        resolve({ success: true, data: Array.from(data) });
      };

      this.inEndpoint.once('data', onData);
    });
  }

  /**
   * Register callback for incoming data
   */
  onDataReceived(callback) {
    this.dataCallback = callback;
  }

  /**
   * Handle incoming USB data
   */
  handleData(data) {
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

    // Try to parse complete messages
    while (this.receiveBuffer.length >= 4) {
      // Check for known response patterns
      const header = this.receiveBuffer[0];

      // Response header: 0xA5 = command acknowledgment
      // Data header: 0xA0 = one-second data record
      if (header === 0xA5) {
        // Command response - typically 64 bytes
        const responseLen = 64;
        if (this.receiveBuffer.length >= responseLen) {
          const responseData = this.receiveBuffer.slice(0, responseLen);
          this.receiveBuffer = this.receiveBuffer.slice(responseLen);
          if (this.dataCallback) {
            this.dataCallback({ type: 'response', data: Array.from(responseData) });
          }
        } else {
          break;
        }
      } else if (header === 0xA0) {
        // One-second data record
        const recordLen = 64;
        if (this.receiveBuffer.length >= recordLen) {
          const recordData = this.receiveBuffer.slice(0, recordLen);
          this.receiveBuffer = this.receiveBuffer.slice(recordLen);
          if (this.dataCallback) {
            this.dataCallback({ type: 'data', data: Array.from(recordData) });
          }
        } else {
          break;
        }
      } else {
        // Unknown header, skip byte
        this.receiveBuffer = this.receiveBuffer.slice(1);
      }
    }
  }

  /**
   * Diagnose USB connection issues
   */
  diagnose() {
    try {
      const devices = usb.getDeviceList();
      const result = {
        success: true,
        totalDevices: devices.length,
        devices: devices.map(d => {
          const desc = d.deviceDescriptor;
          const vid = desc ? desc.idVendor : 0;
          const pid = desc ? desc.idProduct : 0;
          return {
            vid: `0x${vid.toString(16).padStart(4, '0')}`,
            pid: `0x${pid.toString(16).padStart(4, '0')}`,
            address: d.deviceAddress,
            isProcyon: vid === PROCYON_VID && pid === PROCYON_PID,
          };
        }),
        procyonDetail: null,
        rawDebug: [],
      };

      // Find Procyon device
      const procyonDevice = devices.find(d => {
        const desc = d.deviceDescriptor;
        return desc && desc.idVendor === PROCYON_VID && desc.idProduct === PROCYON_PID;
      });

      if (!procyonDevice) {
        result.procyonDetail = { found: false };
        return result;
      }

      // Collect raw debug info for first 2 devices (before open)
      for (let i = 0; i < Math.min(2, devices.length); i++) {
        const d = devices[i];
        try {
          result.rawDebug.push({
            keys: Object.keys(d).join(', '),
            hasDeviceDescriptor: !!d.deviceDescriptor,
            descriptorKeys: d.deviceDescriptor ? Object.keys(d.deviceDescriptor).join(', ') : 'N/A',
            deviceAddress_prop: d.deviceAddress,
            busNumber_prop: d.busNumber,
          });
        } catch (e) {
          result.rawDebug.push({ error: e.message });
        }
      }

      // Detailed Procyon device analysis
      const detail = {
        found: true,
        vid: `0x${PROCYON_VID.toString(16)}`,
        pid: `0x${PROCYON_PID.toString(16)}`,
        address: procyonDevice.deviceAddress,
      };

      // Try to open
      try {
        procyonDevice.open();
        detail.canOpen = true;
        detail.openError = null;

        // Get interface info
        try {
          const iface = procyonDevice.interface(0);
          detail.interfaceMethod = 'device.interface(0)';

          // Interface details
          const ifaceInfo = {
            id: iface.id,
            altSetting: iface.altSetting,
            endpoints: [],
            canClaim: false,
            claimError: null,
            kernelDriverActive: null,
          };

          // Endpoint details
          if (iface.endpoints && iface.endpoints.length > 0) {
            for (const ep of iface.endpoints) {
              const addr = ep.address !== undefined ? `0x${ep.address.toString(16)}` : 'unknown';
              ifaceInfo.endpoints.push({
                address: addr,
                direction: ep.direction,
                transferType: ep.transferType,
              });
            }
          }

          // Check kernel driver
          try {
            ifaceInfo.kernelDriverActive = iface.isKernelDriverActive();
          } catch (kerr) {
            ifaceInfo.kernelDriverActive = `error: ${kerr.message}`;
          }

          // Try to claim
          try {
            iface.claim();
            ifaceInfo.canClaim = true;
            console.log('[USB-DIAG] Successfully claimed interface!');
            // Release it immediately - we're just testing
            try {
              iface.release(false, () => {});
            } catch (relErr) {
              console.log('[USB-DIAG] Release after test claim:', relErr.message);
            }
          } catch (claimErr) {
            ifaceInfo.canClaim = false;
            ifaceInfo.claimError = claimErr.message;
            console.log('[USB-DIAG] Claim failed:', claimErr.message);

            // If claim failed, try detaching kernel driver first
            try {
              iface.detachKernelDriver();
              console.log('[USB-DIAG] Detached kernel driver, retrying claim...');
              try {
                iface.claim();
                ifaceInfo.canClaim = true;
                ifaceInfo.claimAfterDetach = true;
                console.log('[USB-DIAG] Claim succeeded after detach!');
                try {
                  iface.release(false, () => {});
                } catch (relErr) {}
              } catch (retryErr) {
                ifaceInfo.claimAfterDetachError = retryErr.message;
                console.log('[USB-DIAG] Claim after detach still failed:', retryErr.message);
              }
            } catch (detachErr) {
              ifaceInfo.detachError = detachErr.message;
              console.log('[USB-DIAG] Detach kernel driver failed:', detachErr.message);
            }
          }

          detail.interfaces = [ifaceInfo];
        } catch (ifaceErr) {
          detail.interfaceError = ifaceErr.message;
          detail.interfaces = [];
        }

        // Close device after diagnosis
        try {
          procyonDevice.close();
        } catch (closeErr) {
          detail.closeError = closeErr.message;
        }
      } catch (openErr) {
        detail.canOpen = false;
        detail.openError = openErr.message;
        detail.interfaces = [];
      }

      result.procyonDetail = detail;
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
