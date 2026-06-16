const usb = require('usb');

const PROCYON_VID = 0x2269;
const PROCYON_PID = 0xBEEF;

// USB Endpoints
const EP_OUT = 0x01;
const EP_IN = 0x81;

// Command definitions (Procyon CM protocol)
const CMD = {
  GET_FIRMWARE_VERSION:     0x01,
  GET_BATTERY_VOLTAGE:      0x02,
  GET_TEMPERATURE:          0x03,
  GET_TOOL_SN:              0x04,
  SET_TOOL_SN:              0x05,
  GET_RUN_ID:               0x06,
  SET_RUN_ID:               0x07,
  GET_CUSTOMER:             0x08,
  SET_CUSTOMER:             0x09,
  GET_DISTRICT:             0x0A,
  SET_DISTRICT:             0x0B,
  GET_COUNTRY:              0x0C,
  SET_COUNTRY:              0x0D,
  GET_DEPTH_OUT:            0x0E,
  SET_DEPTH_OUT:            0x0F,
  GET_UNIQUE_ID:            0x10,
  GET_MEMORY_PARTITIONS:    0x11,
  GET_MEMORY_DUMP_CHUNK:    0x12,
  ERASE_MEMORY:             0x13,
  GET_MEMORY_ERASE_PERCENT: 0x14,
  RUN_SELF_TEST:            0x15,
  INITIALIZE_LOGGER:        0x16,
};

const RESPONSE_HEADER = 0xA5;
const DATA_HEADER = 0xA0;
const PACKET_SIZE = 64;

/**
 * Procyon USB Bridge for Electron main process
 * 
 * On Windows with WinUSB driver:
 * - WinUSB automatically claims the interface when the device is opened
 * - libusb_claim_interface() returns LIBUSB_ERROR_NOT_FOUND (expected)
 * - We skip the claim step and use endpoints directly
 * - This is the same approach LibUsbDotNet uses on Windows
 */
class ProcyonUsbBridge {
  constructor() {
    this.device = null;
    this.connected = false;
    this.iface = null;
    this.inEndpoint = null;
    this.outEndpoint = null;
    this.receiveBuffer = Buffer.alloc(0);
    this.dataCallback = null;
    this.ifaceClaimed = false;
    this.pendingResponse = null;
    this.responseResolve = null;
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
      console.error('[USB] Failed to list devices:', error);
      return [];
    }
  }

  /**
   * Get interface from device - Windows+WinUSB requires interface(1) not interface(0)
   * This is a known quirk: node-usb on Windows with WinUSB driver has an offset
   * where device.interface(1) returns the first actual interface (id=0).
   */
  _getInterface(device) {
    // Try interface numbers in order: 1 first (Windows+WinUSB), then 0, then 2-7
    const tryOrder = [1, 0, 2, 3, 4, 5, 6, 7];
    
    for (const n of tryOrder) {
      try {
        const iface = device.interface(n);
        if (iface) {
          // Check if this interface has the endpoints we need
          const hasOut = iface.endpoints && iface.endpoints.some(ep => {
            const addr = ep.address !== undefined ? ep.address : ep.bEndpointAddress;
            return addr === EP_OUT || addr === 0x01;
          });
          const hasIn = iface.endpoints && iface.endpoints.some(ep => {
            const addr = ep.address !== undefined ? ep.address : ep.bEndpointAddress;
            return addr === EP_IN || addr === 0x81;
          });
          
          if (hasOut && hasIn) {
            console.log(`[USB] Found Procyon interface via device.interface(${n}), id=${iface.id}, endpoints=${iface.endpoints.length}`);
            return iface;
          } else {
            console.log(`[USB] interface(${n}) found but missing endpoints (OUT:${hasOut}, IN:${hasIn}), skipping`);
          }
        }
      } catch (err) {
        // Interface not found at this number, continue
      }
    }

    // Fallback: device.interfaces property
    if (device.interfaces && device.interfaces.length > 0) {
      console.log('[USB] Got interface via device.interfaces[0]');
      return device.interfaces[0];
    }

    return null;
  }

  /**
   * Get endpoint by direction
   */
  _getEndpoint(iface, direction) {
    if (!iface || !iface.endpoints) return null;

    const targetAddr = direction === 'out' ? EP_OUT : EP_IN;
    
    for (const ep of iface.endpoints) {
      // Match by direction property
      if (ep.direction === direction) {
        return ep;
      }
    }
    
    // Match by endpoint address
    for (const ep of iface.endpoints) {
      const addr = ep.address !== undefined ? ep.address : ep.bEndpointAddress;
      if (addr === targetAddr) return ep;
    }
    
    return null;
  }

  /**
   * Connect to Procyon device
   */
  async connect() {
    try {
      if (this.connected) {
        await this.disconnect();
      }

      // Find device
      const device = usb.findByIds(PROCYON_VID, PROCYON_PID);
      if (!device) {
        return { success: false, error: 'Procyon device not found. Please check USB connection.' };
      }

      console.log('[USB] Found Procyon device, opening...');

      // Open device
      try {
        device.open();
        console.log('[USB] Device opened successfully');
      } catch (openErr) {
        console.error('[USB] Failed to open device:', openErr.message);
        return { 
          success: false, 
          error: `Failed to open USB device: ${openErr.message}. Make sure no other software is using the device.` 
        };
      }

      this.device = device;

      // Try auto-detach kernel driver
      try {
        device.setAutoDetachKernelDriver(true);
        console.log('[USB] Auto-detach kernel driver enabled');
      } catch (autoDetachErr) {
        console.log('[USB] Auto-detach not supported:', autoDetachErr.message);
      }

      // Set configuration
      try {
        const cfgDesc = device.configDescriptor || (device.allConfigDescriptors && device.allConfigDescriptors[0]);
        if (cfgDesc) {
          device.setConfiguration(cfgDesc.bConfigurationValue);
          console.log('[USB] Set configuration to', cfgDesc.bConfigurationValue);
        }
      } catch (cfgErr) {
        console.log('[USB] setConfiguration:', cfgErr.message);
      }

      // Get interface - on Windows+WinUSB, device.interface(1) works, not interface(0)
      const iface = this._getInterface(device);
      if (!iface) {
        try { device.close(); } catch(e) {}
        this.device = null;
        return { success: false, error: 'No USB interface found on device. Try reconnecting the USB cable.' };
      }

      this.iface = iface;

      // Try to claim the interface
      // On Windows + WinUSB, claim may fail with LIBUSB_ERROR_NOT_FOUND
      // This is EXPECTED - WinUSB auto-claims when device is opened
      this.ifaceClaimed = false;
      try {
        iface.claim();
        this.ifaceClaimed = true;
        console.log('[USB] Successfully claimed interface');
      } catch (claimErr) {
        console.log('[USB] Claim failed (expected on Windows+WinUSB):', claimErr.message);
        // Continue without claiming - WinUSB handles this internally
      }

      // Find endpoints
      this.outEndpoint = this._getEndpoint(iface, 'out');
      this.inEndpoint = this._getEndpoint(iface, 'in');

      console.log('[USB] OUT endpoint:', this.outEndpoint ? 'found' : 'NOT found');
      console.log('[USB] IN endpoint:', this.inEndpoint ? 'found' : 'NOT found');

      if (!this.inEndpoint || !this.outEndpoint) {
        this._cleanup();
        return { 
          success: false, 
          error: `USB endpoints not found. IN: ${!!this.inEndpoint}, OUT: ${!!this.outEndpoint}` 
        };
      }

      // Start listening for incoming data
      // Use 3 pending transfers of 64 bytes each (matching USB packet size)
      try {
        this.inEndpoint.startPoll(3, 64);
        this.inEndpoint.on('data', (data) => {
          this._onUsbData(data);
        });
        this.inEndpoint.on('error', (err) => {
          console.error('[USB] IN endpoint error:', err.message);
        });
        console.log('[USB] Started polling IN endpoint');
      } catch (pollErr) {
        console.error('[USB] Failed to start polling:', pollErr.message);
        this._cleanup();
        return {
          success: false,
          error: `Failed to start USB data polling: ${pollErr.message}`
        };
      }

      this.connected = true;
      console.log('[USB] Connection established (claimed:', this.ifaceClaimed, ')');
      return { success: true };
    } catch (error) {
      console.error('[USB] Connection error:', error);
      this._cleanup();
      return { success: false, error: `Connection error: ${error.message}` };
    }
  }

  /**
   * Handle incoming USB data - route to response handler or data callback
   */
  _onUsbData(data) {
    console.log('[USB] Received', data.length, 'bytes:', Buffer.from(data).toString('hex'));
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, Buffer.from(data)]);

    while (this.receiveBuffer.length >= 4) {
      const header = this.receiveBuffer[0];

      if (header === RESPONSE_HEADER) {
        // Command response - 64 bytes
        if (this.receiveBuffer.length >= PACKET_SIZE) {
          const responseData = this.receiveBuffer.slice(0, PACKET_SIZE);
          this.receiveBuffer = this.receiveBuffer.slice(PACKET_SIZE);
          
          // If someone is waiting for a response, resolve their promise
          if (this.responseResolve) {
            const resolve = this.responseResolve;
            this.responseResolve = null;
            resolve(Array.from(responseData));
          } else if (this.dataCallback) {
            this.dataCallback({ type: 'response', data: Array.from(responseData) });
          }
        } else {
          break;
        }
      } else if (header === DATA_HEADER) {
        // One-second data record - 64 bytes
        if (this.receiveBuffer.length >= PACKET_SIZE) {
          const recordData = this.receiveBuffer.slice(0, PACKET_SIZE);
          this.receiveBuffer = this.receiveBuffer.slice(PACKET_SIZE);
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
   * Send a command and wait for response
   */
  async _sendCommandAndWait(commandByte, data = [], timeout = 3000) {
    if (!this.connected || !this.outEndpoint) {
      throw new Error('Device not connected');
    }

    // Build command packet (64 bytes, padded with 0xFF)
    const packet = Buffer.alloc(PACKET_SIZE, 0xFF);
    packet[0] = commandByte;
    for (let i = 0; i < data.length && i + 1 < PACKET_SIZE; i++) {
      packet[i + 1] = data[i];
    }

    console.log('[USB] Sending command 0x' + commandByte.toString(16), Buffer.from(packet).toString('hex'));

    // Set up response promise BEFORE sending
    let timedOut = false;
    const responsePromise = new Promise((resolve, reject) => {
      this.responseResolve = resolve;
      
      // Timeout
      const timer = setTimeout(() => {
        if (this.responseResolve === resolve) {
          this.responseResolve = null;
          timedOut = true;
          reject(new Error('Command timeout (no response from device)'));
        }
      }, timeout);
      
      // Clear timeout when resolved
      const originalResolve = resolve;
      this.responseResolve = (data) => {
        clearTimeout(timer);
        originalResolve(data);
      };
    });

    // Send the command
    await new Promise((resolve, reject) => {
      this.outEndpoint.transfer(packet, (err) => {
        if (err) {
          if (!timedOut && this.responseResolve) {
            this.responseResolve = null;
          }
          reject(new Error(`Send failed: ${err.message}`));
        } else {
          console.log('[USB] Command sent successfully');
          resolve();
        }
      });
    });

    // Wait for response
    const response = await responsePromise;
    console.log('[USB] Got response:', Buffer.from(response).toString('hex'));
    return response;
  }

  /**
   * Send a command without waiting for response
   */
  async _sendCommand(commandByte, data = []) {
    if (!this.connected || !this.outEndpoint) {
      throw new Error('Device not connected');
    }

    const packet = Buffer.alloc(PACKET_SIZE, 0xFF);
    packet[0] = commandByte;
    for (let i = 0; i < data.length && i + 1 < PACKET_SIZE; i++) {
      packet[i + 1] = data[i];
    }

    return new Promise((resolve, reject) => {
      this.outEndpoint.transfer(packet, (err) => {
        if (err) {
          reject(new Error(`Send failed: ${err.message}`));
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  /**
   * Parse string from response bytes (null-terminated, padded with 0xFF)
   */
  _parseString(bytes, start, length) {
    let str = '';
    for (let i = start; i < start + length && i < bytes.length; i++) {
      if (bytes[i] === 0x00 || bytes[i] === 0xFF) break;
      str += String.fromCharCode(bytes[i]);
    }
    return str.trim();
  }

  /**
   * Parse signed 16-bit value from response bytes
   */
  _parseS16(bytes, offset) {
    const val = bytes[offset] | (bytes[offset + 1] << 8);
    return val > 32767 ? val - 65536 : val;
  }

  /**
   * Parse unsigned 16-bit value from response bytes
   */
  _parseU16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  /**
   * Encode string to bytes (fixed length, padded with 0xFF)
   */
  _encodeString(str, length) {
    const bytes = [];
    for (let i = 0; i < length; i++) {
      bytes.push(i < str.length ? str.charCodeAt(i) : 0xFF);
    }
    return bytes;
  }

  /**
   * Get device information (firmware version, SN, battery, temperature)
   */
  async getDeviceInfo() {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }

      const info = {};

      // Get firmware version
      try {
        const fwResp = await this._sendCommandAndWait(CMD.GET_FIRMWARE_VERSION);
        info.firmwareVersion = this._parseString(fwResp, 1, 30);
      } catch (e) {
        console.log('[USB] Get firmware version failed:', e.message);
        info.firmwareVersion = 'N/A';
      }

      // Get Tool SN
      try {
        const snResp = await this._sendCommandAndWait(CMD.GET_TOOL_SN);
        info.toolSN = this._parseString(snResp, 1, 15);
      } catch (e) {
        console.log('[USB] Get Tool SN failed:', e.message);
        info.toolSN = '';
      }

      // Get Unique ID
      try {
        const uidResp = await this._sendCommandAndWait(CMD.GET_UNIQUE_ID);
        info.uniqueId = this._parseString(uidResp, 1, 30);
      } catch (e) {
        console.log('[USB] Get Unique ID failed:', e.message);
        info.uniqueId = '';
      }

      // Get battery voltage (in millivolts, convert to volts)
      try {
        const battResp = await this._sendCommandAndWait(CMD.GET_BATTERY_VOLTAGE);
        const rawBatt = this._parseU16(battResp, 1);
        info.batteryVoltage = rawBatt / 1000.0;
      } catch (e) {
        console.log('[USB] Get battery voltage failed:', e.message);
        info.batteryVoltage = 0;
      }

      // Get temperature (in 0.1°C)
      try {
        const tempResp = await this._sendCommandAndWait(CMD.GET_TEMPERATURE);
        const rawTemp = this._parseS16(tempResp, 1);
        info.temperature = rawTemp / 10.0;
      } catch (e) {
        console.log('[USB] Get temperature failed:', e.message);
        info.temperature = undefined;
      }

      // Get serial number from USB descriptor
      try {
        if (this.device && this.device.deviceDescriptor) {
          const serialIndex = this.device.deviceDescriptor.iSerialNumber;
          if (serialIndex > 0) {
            info.serialNumber = this.device.getStringDescriptor(serialIndex);
          }
        }
      } catch (e) {
        info.serialNumber = '';
      }

      return { success: true, info };
    } catch (error) {
      console.error('[USB] getDeviceInfo error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set tool serial number
   */
  async setToolSN(sn) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const data = this._encodeString(sn, 15);
      await this._sendCommandAndWait(CMD.SET_TOOL_SN, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setToolSN error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set run ID
   */
  async setRunID(runId) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const data = this._encodeString(runId, 15);
      await this._sendCommandAndWait(CMD.SET_RUN_ID, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setRunID error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set customer
   */
  async setCustomer(customer) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const data = this._encodeString(customer, 30);
      await this._sendCommandAndWait(CMD.SET_CUSTOMER, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setCustomer error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set district
   */
  async setDistrict(district) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const data = this._encodeString(district, 30);
      await this._sendCommandAndWait(CMD.SET_DISTRICT, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setDistrict error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set country
   */
  async setCountry(country) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      const data = this._encodeString(country, 30);
      await this._sendCommandAndWait(CMD.SET_COUNTRY, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setCountry error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set depth out
   */
  async setDepthOut(depth) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }
      // Encode as 4-byte float
      const buf = Buffer.alloc(4);
      buf.writeFloatLE(depth);
      const data = Array.from(buf);
      await this._sendCommandAndWait(CMD.SET_DEPTH_OUT, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] setDepthOut error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get battery voltage
   */
  async getBatteryVoltage() {
    try {
      if (!this.connected) {
        return { success: false, voltage: 0, error: 'Device not connected' };
      }
      const resp = await this._sendCommandAndWait(CMD.GET_BATTERY_VOLTAGE);
      const rawBatt = this._parseU16(resp, 1);
      return { success: true, voltage: rawBatt / 1000.0 };
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
      const resp = await this._sendCommandAndWait(CMD.GET_TEMPERATURE);
      const rawTemp = this._parseS16(resp, 1);
      return { success: true, temperature: rawTemp / 10.0 };
    } catch (error) {
      return { success: false, temperature: 0, error: error.message };
    }
  }

  /**
   * Get number of memory partitions
   */
  async getMemoryPartitions() {
    try {
      if (!this.connected) {
        return { success: false, count: 0, error: 'Device not connected' };
      }
      const resp = await this._sendCommandAndWait(CMD.GET_MEMORY_PARTITIONS);
      const count = resp[1] || 0;
      return { success: true, count };
    } catch (error) {
      return { success: false, count: 0, error: error.message };
    }
  }

  /**
   * Get memory erase percent
   */
  async getMemoryErasePercent() {
    try {
      if (!this.connected) {
        return { success: false, percent: 0, error: 'Device not connected' };
      }
      const resp = await this._sendCommandAndWait(CMD.GET_MEMORY_ERASE_PERCENT);
      const percent = resp[1] || 0;
      return { success: true, percent };
    } catch (error) {
      return { success: false, percent: 0, error: error.message };
    }
  }

  /**
   * Download one-second data from device memory
   */
  async downloadOneSecondData(options = {}) {
    try {
      if (!this.connected) {
        return { success: false, data: [], totalRecords: 0, error: 'Device not connected' };
      }

      // First get memory partition count
      const partResult = await this.getMemoryPartitions();
      if (!partResult.success) {
        return { success: false, data: [], totalRecords: 0, error: partResult.error };
      }

      const partitionCount = options.maxPartitions || partResult.count;
      const records = [];
      const CHUNK_SIZE = 32; // 32 one-second records per chunk (32 * 64 = 2048 bytes)

      console.log('[USB] Starting download, partitions:', partitionCount);

      // Register data callback to collect records
      let dataResolve = null;
      const collectedRecords = [];
      
      const originalCallback = this.dataCallback;
      this.dataCallback = (msg) => {
        if (msg.type === 'data') {
          const parsed = this._parseOneSecondRecord(msg.data);
          if (parsed) {
            collectedRecords.push(parsed);
          }
        }
      };

      try {
        // Request each chunk
        const totalChunks = Math.ceil(partitionCount * 3600 / CHUNK_SIZE); // Assume 3600 records per partition (1 hour)
        
        for (let chunk = 0; chunk < totalChunks; chunk++) {
          // Send chunk request
          const chunkData = [
            chunk & 0xFF,
            (chunk >> 8) & 0xFF,
            (chunk >> 16) & 0xFF,
            (chunk >> 24) & 0xFF,
          ];
          
          try {
            await this._sendCommand(CMD.GET_MEMORY_DUMP_CHUNK, chunkData);
          } catch (e) {
            console.log('[USB] Chunk', chunk, 'request failed:', e.message);
            break;
          }

          // Wait a bit for data to arrive
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Wait for remaining data
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        // Restore original callback
        this.dataCallback = originalCallback;
      }

      return { 
        success: true, 
        data: collectedRecords, 
        totalRecords: collectedRecords.length 
      };
    } catch (error) {
      console.error('[USB] downloadOneSecondData error:', error);
      return { success: false, data: [], totalRecords: 0, error: error.message };
    }
  }

  /**
   * Parse one-second data record (0xA0 header, 64 bytes)
   */
  _parseOneSecondRecord(bytes) {
    try {
      if (!bytes || bytes.length < 60 || bytes[0] !== DATA_HEADER) {
        return null;
      }

      // OneSecondData format: 29 x s16 values starting at offset 2
      // Layout:
      //   [2-3]   Temperature (0.1°C)
      //   [4-5]   Battery Voltage (mV)
      //   [6-7]   RPM Min X
      //   [8-9]   RPM Max X
      //   [10-11] RPM Avg X
      //   [12-13] RPM RMS X
      //   [14-15] RPM Min Y
      //   [16-17] RPM Max Y
      //   [18-19] RPM Avg Y
      //   [20-21] RPM RMS Y
      //   [22-23] RPM Min Z
      //   [24-25] RPM Max Z
      //   [26-27] RPM Avg Z
      //   [28-29] RPM RMS Z
      //   [30-31] Shock Low Min X
      //   [32-33] Shock Low Max X
      //   [34-35] Shock Low Avg X
      //   [36-37] Shock Low RMS X
      //   [38-39] Shock Low Min Y
      //   [40-41] Shock Low Max Y
      //   [42-43] Shock Low Avg Y
      //   [44-45] Shock Low RMS Y
      //   [46-47] Shock Low Min Z
      //   [48-49] Shock Low Max Z
      //   [50-51] Shock Low Avg Z
      //   [52-53] Shock Low RMS Z
      //   [54-55] Shock Min X
      //   [56-57] Shock Max X
      //   [58-59] Sequence counter

      const temp = this._parseS16(bytes, 2) / 10.0;
      const batt = this._parseU16(bytes, 4) / 1000.0;
      const seq = this._parseU16(bytes, 58);

      return {
        timestamp: new Date().toISOString(), // Will be refined with actual timestamps
        temperature: temp,
        batteryVoltage: batt,
        rpmMinX: this._parseS16(bytes, 6),
        rpmMaxX: this._parseS16(bytes, 8),
        rpmAvgX: this._parseS16(bytes, 10),
        rpmRmsX: this._parseS16(bytes, 12),
        rpmMinY: this._parseS16(bytes, 14),
        rpmMaxY: this._parseS16(bytes, 16),
        rpmAvgY: this._parseS16(bytes, 18),
        rpmRmsY: this._parseS16(bytes, 20),
        rpmMinZ: this._parseS16(bytes, 22),
        rpmMaxZ: this._parseS16(bytes, 24),
        rpmAvgZ: this._parseS16(bytes, 26),
        rpmRmsZ: this._parseS16(bytes, 28),
        shockLowMinX: this._parseS16(bytes, 30),
        shockLowMaxX: this._parseS16(bytes, 32),
        shockLowAvgX: this._parseS16(bytes, 34),
        shockLowRmsX: this._parseS16(bytes, 36),
        shockLowMinY: this._parseS16(bytes, 38),
        shockLowMaxY: this._parseS16(bytes, 40),
        shockLowAvgY: this._parseS16(bytes, 42),
        shockLowRmsY: this._parseS16(bytes, 44),
        shockLowMinZ: this._parseS16(bytes, 46),
        shockLowMaxZ: this._parseS16(bytes, 48),
        shockLowAvgZ: this._parseS16(bytes, 50),
        shockLowRmsZ: this._parseS16(bytes, 52),
        shockMinX: this._parseS16(bytes, 54),
        shockMaxX: this._parseS16(bytes, 56),
      };
    } catch (e) {
      console.error('[USB] Parse one-second record error:', e);
      return null;
    }
  }

  /**
   * Run self test
   */
  async runSelfTest() {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }

      // Send self test command
      const resp = await this._sendCommandAndWait(CMD.RUN_SELF_TEST, [], 10000);

      // Parse test results from response
      // Each result: name (string) + status (byte)
      const results = [];
      
      // Try to parse multiple response packets
      // Self test may take several seconds and return multiple responses
      const testNames = [
        'Firmware Test',
        'Memory Test',
        'Sensor Test',
        'Communication Test',
        'Battery Test',
        'Temperature Test',
      ];

      for (let i = 0; i < testNames.length; i++) {
        const statusByte = i < resp.length - 1 ? resp[i + 1] : 0;
        let status;
        if (statusByte === 0x01) status = 'pass';
        else if (statusByte === 0x02) status = 'fail';
        else if (statusByte === 0x03) status = 'warning';
        else status = 'skip';

        results.push({
          name: testNames[i],
          status,
          duration: 0,
        });
      }

      return { success: true, results };
    } catch (error) {
      console.error('[USB] runSelfTest error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Initialize logger
   */
  async initializeLogger(config) {
    try {
      if (!this.connected) {
        return { success: false, error: 'Device not connected' };
      }

      // Build initialization packet
      const data = [];
      // Tool SN (15 bytes)
      data.push(...this._encodeString(config.toolSN || '', 15));
      // Run ID (15 bytes)
      data.push(...this._encodeString(config.runId || '', 15));
      // Customer (30 bytes)
      data.push(...this._encodeString(config.customer || '', 30));
      // District (30 bytes)
      data.push(...this._encodeString(config.district || '', 30));

      await this._sendCommandAndWait(CMD.INITIALIZE_LOGGER, data);
      return { success: true };
    } catch (error) {
      console.error('[USB] initializeLogger error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup helper
   */
  _cleanup() {
    if (this.inEndpoint) {
      try { this.inEndpoint.stopPoll(); } catch(e) {}
      this.inEndpoint = null;
    }
    if (this.iface) {
      if (this.ifaceClaimed) {
        try { this.iface.release(false, () => {}); } catch(e) {}
      }
      this.iface = null;
    }
    if (this.device) {
      try { this.device.close(); } catch(e) {}
      this.device = null;
    }
    this.outEndpoint = null;
    this.ifaceClaimed = false;
    this.connected = false;
    this.receiveBuffer = Buffer.alloc(0);
    this.responseResolve = null;
  }

  /**
   * Disconnect from device
   */
  async disconnect() {
    try {
      this._cleanup();
      console.log('[USB] Disconnected');
      return { success: true };
    } catch (error) {
      console.error('[USB] Disconnect error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Diagnose USB connection
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

        // Try auto-detach
        try {
          procyonDevice.setAutoDetachKernelDriver(true);
          detail.autoDetach = 'enabled';
        } catch (adErr) {
          detail.autoDetach = `error: ${adErr.message}`;
        }

        // Try setConfiguration
        try {
          const cfgDesc = procyonDevice.configDescriptor || 
            (procyonDevice.allConfigDescriptors && procyonDevice.allConfigDescriptors[0]);
          if (cfgDesc) {
            procyonDevice.setConfiguration(cfgDesc.bConfigurationValue);
            detail.configurationSet = cfgDesc.bConfigurationValue;
          }
        } catch (cfgErr) {
          detail.configurationSet = `error: ${cfgErr.message}`;
        }

        // Dump full config descriptor info
        detail.configDescriptor = null;
        try {
          const configs = procyonDevice.allConfigDescriptors;
          if (configs && configs.length > 0) {
            detail.configDescriptor = configs.map((cfg, ci) => ({
              index: ci,
              configurationValue: cfg.bConfigurationValue,
              numInterfaces: cfg.bNumInterfaces,
              interfaces: cfg.interfaces ? cfg.interfaces.map((ifaceArr, ii) =>
                ifaceArr.map(alt => ({
                  interfaceNumber: ii,
                  altSetting: alt.bAlternateSetting,
                  interfaceClass: `0x${alt.bInterfaceClass.toString(16)}`,
                  interfaceSubClass: `0x${alt.bInterfaceSubClass.toString(16)}`,
                  numEndpoints: alt.bNumEndpoints,
                  endpoints: alt.endpoints ? alt.endpoints.map(ep => ({
                    address: `0x${ep.bEndpointAddress.toString(16)}`,
                    direction: (ep.bEndpointAddress & 0x80) ? 'IN' : 'OUT',
                    attributes: `0x${ep.bmAttributes.toString(16)}`,
                    maxPacketSize: ep.wMaxPacketSize,
                  })) : [],
                }))
              ) : [],
            }));
          }
        } catch (descErr) {
          detail.configDescriptorError = descErr.message;
        }

        // Get interface - try all methods
        detail.interfaceAttempts = [];
        detail.interfaces = [];

        // Try each interface number 0-3
        for (let ifaceNum = 0; ifaceNum < 4; ifaceNum++) {
          try {
            const testIface = procyonDevice.interface(ifaceNum);
            if (testIface) {
              const ifaceInfo = {
                interfaceNumber: ifaceNum,
                id: testIface.id,
                altSetting: testIface.altSetting,
                endpoints: [],
                canClaim: false,
                claimError: null,
              };

              if (testIface.endpoints && testIface.endpoints.length > 0) {
                for (const ep of testIface.endpoints) {
                  const addr = ep.address !== undefined ? `0x${ep.address.toString(16)}` : 'unknown';
                  ifaceInfo.endpoints.push({
                    address: addr,
                    direction: ep.direction,
                    transferType: ep.transferType,
                  });
                }
              }

              // Try claim
              try {
                testIface.claim();
                ifaceInfo.canClaim = true;
                console.log('[USB-DIAG] Claim succeeded for interface', ifaceNum);
                try { testIface.release(false, () => {}); } catch(e) {}
              } catch (claimErr) {
                ifaceInfo.canClaim = false;
                ifaceInfo.claimError = claimErr.message;
                console.log('[USB-DIAG] Claim failed for interface', ifaceNum, ':', claimErr.message);
              }

              detail.interfaces.push(ifaceInfo);
              detail.interfaceAttempts.push({ ifaceNum, result: 'found' });
            }
          } catch (ifaceErr) {
            detail.interfaceAttempts.push({ ifaceNum, result: 'not found', error: ifaceErr.message });
          }
        }

        // Also try device.interfaces property
        try {
          if (procyonDevice.interfaces) {
            detail.interfacesProperty = {
              length: procyonDevice.interfaces.length,
              types: procyonDevice.interfaces.map(i => typeof i),
            };
          }
        } catch (e) {
          detail.interfacesPropertyError = e.message;
        }

        if (detail.interfaces.length === 0) {
          detail.interfaceError = 'No interfaces found via any method';
        }

        // Close device after diagnosis
        try { procyonDevice.close(); } catch(e) {}
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
