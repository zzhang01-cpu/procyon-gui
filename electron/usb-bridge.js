/**
 * Procyon USB Bridge
 * Handles USB bulk transfer communication with Procyon CM device
 * Runs in Electron main process (Node.js)
 * 
 * Requires WinUSB driver installed via Zadig for VID=0x2269 PID=0xBEEF
 */

const usb = require('usb');

// USB Device identifiers
const PROCYON_VID = 0x2269;
const PROCYON_PID = 0xBEEF;

// Command codes (extracted from Procyon.dll analysis)
const CMD = {
  GET_FIRMWARE_VERSION: 0x01,
  GET_TOOL_SN: 0x02,
  GET_UNIQUE_ID: 0x03,
  SET_TOOL_SN: 0x10,
  SET_RUN_ID: 0x11,
  SET_CUSTOMER: 0x12,
  SET_DISTRICT: 0x13,
  SET_COUNTRY: 0x14,
  SET_DEPTH_OUT: 0x15,
  GET_BATTERY_VOLTAGE: 0x20,
  GET_TEMPERATURE: 0x21,
  GET_PRESSURE_DATA: 0x22,
  GET_ROTATIONAL_DATA: 0x23,
  SET_SELF_TEST_MODE: 0x30,
  GET_SELF_TEST_MODE_STATUS: 0x31,
  GET_NUMBER_MEMORY_PARTITIONS: 0x40,
  GET_MEMORY_ERASE_PERCENT: 0x41,
  GET_MEMORY_DUMP_CHUNK: 0x42,
  INITIALIZE_LOGGER: 0x50,
  ACK: 0xAA,
  NACK: 0x55,
};

// Frame structure
const FRAME_HEADER = 0x5A;
const FRAME_FOOTER = 0xA5;

class ProcyonUsbBridge {
  constructor() {
    this.device = null;
    this.iface = null;
    this.inEndpoint = null;
    this.outEndpoint = null;
    this.connected = false;
    this.responseBuffer = Buffer.alloc(0);
    this.pendingResolve = null;
    this.pendingReject = null;
    this.responseTimeout = null;
    this.interfaceNumber = 0;
  }

  /**
   * List USB devices that match Procyon VID/PID
   */
  listDevices() {
    try {
      const devices = usb.getDeviceList();
      return devices
        .filter(d => {
          const desc = d.deviceDescriptor;
          return desc.idVendor === PROCYON_VID && desc.idProduct === PROCYON_PID;
        })
        .map(d => {
          const desc = d.deviceDescriptor;
          return {
            vendorId: `0x${desc.idVendor.toString(16).padStart(4, '0')}`,
            productId: `0x${desc.idProduct.toString(16).padStart(4, '0')}`,
            deviceAddress: d.deviceAddress,
            isProcyon: true,
          };
        });
    } catch (error) {
      console.error('Failed to list USB devices:', error);
      return [];
    }
  }

  /**
   * Connect to Procyon device via USB
   */
  async connect() {
    try {
      if (this.connected) {
        await this.disconnect();
      }

      // Find Procyon device
      const devices = this.listDevices();
      if (devices.length === 0) {
        return { success: false, error: 'Procyon device not found. Please check USB connection and WinUSB driver.' };
      }

      this.device = usb.getDeviceList().find(d => {
        const desc = d.deviceDescriptor;
        return desc.idVendor === PROCYON_VID && desc.idProduct === PROCYON_PID;
      });

      if (!this.device) {
        return { success: false, error: 'Failed to open Procyon device' };
      }

      // Open device
      this.device.open();

      // Log device info for debugging
      const desc = this.device.deviceDescriptor;
      const configDesc = this.device.configDescriptor;
      console.log('[USB] Device opened. Configurations:', desc.bNumConfigurations);
      console.log('[USB] Number of interfaces:', configDesc.interfaces.length);
      for (let i = 0; i < configDesc.interfaces.length; i++) {
        const ifaceInfo = configDesc.interfaces[i];
        console.log(`[USB] Interface ${i}:`, JSON.stringify({
          altSettings: ifaceInfo.length,
          endpoints: ifaceInfo[0]?.endpoints?.map(e => ({
            address: '0x' + e.bEndpointAddress.toString(16),
            direction: e.direction,
            transferType: e.transferType
          }))
        }));
      }

      // Claim interface - try each interface with kernel driver detach
      let claimedInterface = -1;
      for (let i = 0; i < configDesc.interfaces.length; i++) {
        try {
          this.iface = this.device.interface(i);
          
          // On Windows/Linux, detach kernel driver if active
          try {
            if (this.iface.isKernelDriverActive()) {
              console.log(`[USB] Kernel driver active on interface ${i}, detaching...`);
              this.iface.detachKernelDriver();
            }
          } catch (detachErr) {
            console.warn(`[USB] Could not detach kernel driver on interface ${i}:`, detachErr.message);
          }
          
          this.iface.claim();
          claimedInterface = i;
          this.interfaceNumber = i;
          console.log(`[USB] Successfully claimed interface ${i}`);
          break;
        } catch (e) {
          console.warn(`[USB] Failed to claim interface ${i}:`, e.message);
        }
      }

      if (claimedInterface === -1) {
        // Try: close and re-open with reset
        try { this.device.close(); } catch(e) {}
        this.device = null;
        return { 
          success: false, 
          error: 'Failed to claim USB interface.\n\nPlease verify:\n1. Open Zadig → Options → List All Devices\n2. Select "Procyon-CM" from dropdown\n3. Make sure the driver shows "WinUSB" (not CDC or other)\n4. Click "Replace Driver"\n5. Unplug and replug the USB cable, then try again' 
        };
      }

      // Find endpoints
      const ifaceDesc = this.iface.altSetting;
      for (const ep of ifaceDesc.endpoints) {
        if (ep.direction === 'in' && ep.transferType === 2) { // Bulk IN
          this.inEndpoint = this.iface.endpoint(ep.bEndpointAddress);
        } else if (ep.direction === 'out' && ep.transferType === 2) { // Bulk OUT
          this.outEndpoint = this.iface.endpoint(ep.bEndpointAddress);
        }
      }

      if (!this.inEndpoint || !this.outEndpoint) {
        // If no bulk endpoints found, try to use the available ones
        for (const ep of ifaceDesc.endpoints) {
          if (!this.inEndpoint && ep.direction === 'in') {
            this.inEndpoint = this.iface.endpoint(ep.bEndpointAddress);
          }
          if (!this.outEndpoint && ep.direction === 'out') {
            this.outEndpoint = this.iface.endpoint(ep.bEndpointAddress);
          }
        }
      }

      if (!this.inEndpoint || !this.outEndpoint) {
        this.iface.release(() => {});
        this.device.close();
        this.device = null;
        return { success: false, error: 'Could not find USB bulk endpoints on device' };
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
      return { success: true };
    } catch (error) {
      this.connected = false;
      this.device = null;
      this.iface = null;
      this.inEndpoint = null;
      this.outEndpoint = null;
      return { success: false, error: error.message || 'USB connection failed' };
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
          // Ignore stop poll errors
        }
        this.inEndpoint = null;
      }

      if (this.iface) {
        try {
          this.iface.release(() => {});
        } catch (e) {
          // Ignore release errors
        }
        this.iface = null;
      }

      if (this.device) {
        try {
          this.device.close();
        } catch (e) {
          // Ignore close errors
        }
        this.device = null;
      }

      this.outEndpoint = null;
      this.connected = false;
      this.responseBuffer = Buffer.alloc(0);
      this.clearPending();
      return { success: true };
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

  /**
   * Build a command frame
   * Frame format: HEADER(0x5A) | CMD | LEN(2 bytes LE) | DATA | CHECKSUM(XOR) | FOOTER(0xA5)
   */
  buildFrame(command, data = Buffer.alloc(0)) {
    const len = data.length;
    const frame = Buffer.alloc(6 + len);
    
    frame[0] = FRAME_HEADER;
    frame[1] = command;
    frame.writeUInt16LE(len, 2);
    
    if (len > 0) {
      data.copy(frame, 4);
    }
    
    // Checksum: XOR of all bytes from CMD to end of DATA
    let checksum = 0;
    for (let i = 1; i < 4 + len; i++) {
      checksum ^= frame[i];
    }
    frame[4 + len] = checksum;
    frame[5 + len] = FRAME_FOOTER;
    
    return frame;
  }

  /**
   * Send command and wait for response
   */
  async sendCommand(command, data = Buffer.alloc(0), timeoutMs = 5000) {
    if (!this.connected || !this.outEndpoint) {
      throw new Error('Device not connected');
    }

    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.responseBuffer = Buffer.alloc(0);

      const frame = this.buildFrame(command, data);
      
      this.outEndpoint.transfer(frame, (err) => {
        if (err) {
          this.clearPending();
          reject(new Error('Failed to send command: ' + err.message));
          return;
        }
      });

      this.responseTimeout = setTimeout(() => {
        this.clearPending();
        reject(new Error('Response timeout'));
      }, timeoutMs);
    });
  }

  /**
   * Handle incoming data from USB endpoint
   */
  handleData(data) {
    this.responseBuffer = Buffer.concat([this.responseBuffer, data]);
    
    // Try to parse a complete frame
    const response = this.parseFrame();
    if (response && this.pendingResolve) {
      clearTimeout(this.responseTimeout);
      const resolve = this.pendingResolve;
      this.clearPending();
      resolve(response);
    }
  }

  /**
   * Parse response frame from buffer
   */
  parseFrame() {
    if (this.responseBuffer.length < 6) return null;
    
    // Find header
    const headerIdx = this.responseBuffer.indexOf(FRAME_HEADER);
    if (headerIdx === -1) {
      this.responseBuffer = Buffer.alloc(0);
      return null;
    }
    
    if (headerIdx > 0) {
      this.responseBuffer = this.responseBuffer.slice(headerIdx);
    }
    
    if (this.responseBuffer.length < 6) return null;
    
    const cmd = this.responseBuffer[1];
    const len = this.responseBuffer.readUInt16LE(2);
    const totalLen = 6 + len;
    
    if (this.responseBuffer.length < totalLen) return null;
    
    const data = this.responseBuffer.slice(4, 4 + len);
    const checksum = this.responseBuffer[4 + len];
    const footer = this.responseBuffer[5 + len];
    
    // Verify checksum
    let calcChecksum = 0;
    for (let i = 1; i < 4 + len; i++) {
      calcChecksum ^= this.responseBuffer[i];
    }
    
    // Remove processed frame from buffer
    this.responseBuffer = this.responseBuffer.slice(totalLen);
    
    if (footer !== FRAME_FOOTER) {
      console.warn('Invalid frame footer');
      return null;
    }
    
    if (checksum !== calcChecksum) {
      console.warn('Checksum mismatch');
      return null;
    }
    
    return {
      command: cmd,
      data: data,
      success: cmd !== CMD.NACK,
    };
  }

  /**
   * Clear pending response handlers
   */
  clearPending() {
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout);
    }
    this.pendingResolve = null;
    this.pendingReject = null;
    this.responseTimeout = null;
  }

  // ==================== Device Commands ====================

  /**
   * Get device information
   */
  async getDeviceInfo() {
    try {
      if (!this.isConnected()) {
        return { success: false, error: 'Not connected' };
      }

      // Query firmware version
      let firmwareVersion = 'Unknown';
      try {
        const fwResp = await this.sendCommand(CMD.GET_FIRMWARE_VERSION);
        if (fwResp.success && fwResp.data.length >= 3) {
          firmwareVersion = `${fwResp.data[0]}.${fwResp.data[1]}.${fwResp.data[2]}`;
        }
      } catch (e) {
        console.warn('Failed to get firmware version:', e.message);
      }

      // Query tool SN
      let toolSN = 'Unknown';
      try {
        const snResp = await this.sendCommand(CMD.GET_TOOL_SN);
        if (snResp.success && snResp.data.length > 0) {
          toolSN = snResp.data.toString('ascii').replace(/\0/g, '').trim();
        }
      } catch (e) {
        console.warn('Failed to get tool SN:', e.message);
      }

      // Query unique ID
      let uniqueId = 'Unknown';
      try {
        const uidResp = await this.sendCommand(CMD.GET_UNIQUE_ID);
        if (uidResp.success && uidResp.data.length > 0) {
          uniqueId = uidResp.data.toString('hex').toUpperCase();
        }
      } catch (e) {
        console.warn('Failed to get unique ID:', e.message);
      }

      // Query battery voltage
      let batteryVoltage = 0;
      try {
        const battResp = await this.sendCommand(CMD.GET_BATTERY_VOLTAGE);
        if (battResp.success && battResp.data.length >= 2) {
          const rawValue = battResp.data.readInt16LE(0);
          batteryVoltage = rawValue * 0.001027;
        }
      } catch (e) {
        console.warn('Failed to get battery voltage:', e.message);
      }

      // Query temperature
      let temperature = 0;
      try {
        const tempResp = await this.sendCommand(CMD.GET_TEMPERATURE);
        if (tempResp.success && tempResp.data.length >= 2) {
          const rawValue = tempResp.data.readInt16LE(0);
          temperature = rawValue * 0.03125;
        }
      } catch (e) {
        console.warn('Failed to get temperature:', e.message);
      }

      return {
        success: true,
        info: {
          firmwareVersion,
          toolSN,
          uniqueId,
          batteryVoltage,
          temperature,
          serialNumber: toolSN,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set tool serial number
   */
  async setToolSN(sn) {
    try {
      const data = Buffer.alloc(32);
      data.write(sn.substring(0, 32), 'ascii');
      const resp = await this.sendCommand(CMD.SET_TOOL_SN, data);
      return { success: resp.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set run ID
   */
  async setRunID(runId) {
    try {
      const data = Buffer.alloc(32);
      data.write(runId.substring(0, 32), 'ascii');
      const resp = await this.sendCommand(CMD.SET_RUN_ID, data);
      return { success: resp.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set customer
   */
  async setCustomer(customer) {
    try {
      const data = Buffer.alloc(64);
      data.write(customer.substring(0, 64), 'utf8');
      const resp = await this.sendCommand(CMD.SET_CUSTOMER, data);
      return { success: resp.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set district
   */
  async setDistrict(district) {
    try {
      const data = Buffer.alloc(64);
      data.write(district.substring(0, 64), 'utf8');
      const resp = await this.sendCommand(CMD.SET_DISTRICT, data);
      return { success: resp.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set country
   */
  async setCountry(country) {
    try {
      const data = Buffer.alloc(64);
      data.write(country.substring(0, 64), 'utf8');
      const resp = await this.sendCommand(CMD.SET_COUNTRY, data);
      return { success: resp.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set depth out
   */
  async setDepthOut(depth) {
    try {
      const data = Buffer.alloc(4);
      data.writeFloatLE(depth, 0);
      const resp = await this.sendCommand(CMD.SET_DEPTH_OUT, data);
      return { success: resp.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get number of memory partitions
   */
  async getMemoryPartitions() {
    try {
      const resp = await this.sendCommand(CMD.GET_NUMBER_MEMORY_PARTITIONS);
      if (resp.success && resp.data.length >= 2) {
        return { success: true, count: resp.data.readUInt16LE(0) };
      }
      return { success: false, count: 0 };
    } catch (error) {
      return { success: false, count: 0, error: error.message };
    }
  }

  /**
   * Get memory erase percent
   */
  async getMemoryErasePercent() {
    try {
      const resp = await this.sendCommand(CMD.GET_MEMORY_ERASE_PERCENT);
      if (resp.success && resp.data.length >= 1) {
        return { success: true, percent: resp.data[0] };
      }
      return { success: false, percent: 0 };
    } catch (error) {
      return { success: false, percent: 0, error: error.message };
    }
  }

  /**
   * Download one second data
   */
  async downloadOneSecondData(options = {}) {
    try {
      // Get memory partition count
      const partitionResp = await this.getMemoryPartitions();
      if (!partitionResp.success) {
        return { success: false, error: 'Failed to get partition count' };
      }

      const partitions = partitionResp.count;
      const records = [];
      const maxPartitions = options.maxPartitions || partitions;

      for (let p = 0; p < Math.min(maxPartitions, partitions); p++) {
        // Request partition data
        const reqData = Buffer.alloc(6);
        reqData.writeUInt16LE(p, 0);         // Partition number
        reqData.writeUInt32LE(0, 2);          // Offset

        const resp = await this.sendCommand(CMD.GET_MEMORY_DUMP_CHUNK, reqData, 10000);
        
        if (resp.success && resp.data.length > 0) {
          // Parse one second data records
          const parsed = this.parseOneSecondData(resp.data);
          records.push(...parsed);
        }
      }

      return { success: true, data: records, totalRecords: records.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse one second data from binary buffer
   */
  parseOneSecondData(buffer) {
    const records = [];
    const RECORD_SIZE = 58; // 29 * 2 bytes per record (s16 fields)
    let offset = 0;

    while (offset + RECORD_SIZE <= buffer.length) {
      // Check record type marker (0xA0 = OneSecondData)
      if (buffer[offset] === 0xA0) {
        offset += 1; // Skip type marker
      }

      if (offset + RECORD_SIZE > buffer.length) break;

      const record = {
        timestamp: new Date().toISOString(),
        temperature: buffer.readInt16LE(offset + 0) * 0.03125,
        batteryVoltage: buffer.readInt16LE(offset + 2) * 0.001027,
        rpmMinX: buffer.readInt16LE(offset + 4) * 0.02333,
        rpmMaxX: buffer.readInt16LE(offset + 6) * 0.02333,
        rpmAvgX: buffer.readInt16LE(offset + 8) * 0.02333,
        rpmRmsX: buffer.readInt16LE(offset + 10) * 0.02333,
        rpmMinY: buffer.readInt16LE(offset + 12) * 0.02333,
        rpmMaxY: buffer.readInt16LE(offset + 14) * 0.02333,
        rpmAvgY: buffer.readInt16LE(offset + 16) * 0.02333,
        rpmRmsY: buffer.readInt16LE(offset + 18) * 0.02333,
        rpmMinZ: buffer.readInt16LE(offset + 20) * 0.02333,
        rpmMaxZ: buffer.readInt16LE(offset + 22) * 0.02333,
        rpmAvgZ: buffer.readInt16LE(offset + 24) * 0.02333,
        rpmRmsZ: buffer.readInt16LE(offset + 26) * 0.02333,
        shockLowMinX: buffer.readInt16LE(offset + 28) * 0.000244,
        shockLowMaxX: buffer.readInt16LE(offset + 30) * 0.000244,
        shockLowAvgX: buffer.readInt16LE(offset + 32) * 0.000244,
        shockLowRmsX: buffer.readInt16LE(offset + 34) * 0.000244,
        shockLowMinY: buffer.readInt16LE(offset + 36) * 0.000244,
        shockLowMaxY: buffer.readInt16LE(offset + 38) * 0.000244,
        shockLowAvgY: buffer.readInt16LE(offset + 40) * 0.000244,
        shockLowRmsY: buffer.readInt16LE(offset + 42) * 0.000244,
        shockLowMinZ: buffer.readInt16LE(offset + 44) * 0.000244,
        shockLowMaxZ: buffer.readInt16LE(offset + 46) * 0.000244,
        shockLowAvgZ: buffer.readInt16LE(offset + 48) * 0.000244,
        shockLowRmsZ: buffer.readInt16LE(offset + 50) * 0.000244,
        shockMinX: buffer.readInt16LE(offset + 52) * 0.2,
        shockMaxX: buffer.readInt16LE(offset + 54) * 0.2,
      };

      records.push(record);
      offset += RECORD_SIZE;
    }

    return records;
  }

  /**
   * Run self test
   */
  async runSelfTest() {
    try {
      const results = [];
      const tests = [
        { name: 'Sensor Test', command: CMD.SET_SELF_TEST_MODE, data: Buffer.from([0x01]) },
        { name: 'Communication Test', command: CMD.GET_SELF_TEST_MODE_STATUS },
        { name: 'Memory Test', command: CMD.GET_NUMBER_MEMORY_PARTITIONS },
        { name: 'Battery Test', command: CMD.GET_BATTERY_VOLTAGE },
      ];

      for (const test of tests) {
        const startTime = Date.now();
        try {
          const resp = await this.sendCommand(test.command, test.data || Buffer.alloc(0), 8000);
          const duration = Date.now() - startTime;
          results.push({
            name: test.name,
            status: resp.success ? 'pass' : 'fail',
            duration,
          });
        } catch (e) {
          results.push({
            name: test.name,
            status: 'fail',
            duration: Date.now() - startTime,
            error: e.message,
          });
        }
      }

      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get battery voltage
   */
  async getBatteryVoltage() {
    try {
      const resp = await this.sendCommand(CMD.GET_BATTERY_VOLTAGE);
      if (resp.success && resp.data.length >= 2) {
        const rawValue = resp.data.readInt16LE(0);
        return { success: true, voltage: rawValue * 0.001027 };
      }
      return { success: false, voltage: 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get temperature
   */
  async getTemperature() {
    try {
      const resp = await this.sendCommand(CMD.GET_TEMPERATURE);
      if (resp.success && resp.data.length >= 2) {
        const rawValue = resp.data.readInt16LE(0);
        return { success: true, temperature: rawValue * 0.03125 };
      }
      return { success: false, temperature: 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Initialize logger
   */
  async initializeLogger(config) {
    try {
      const data = Buffer.alloc(256);
      let offset = 0;
      
      if (config.toolSN) {
        data.write(config.toolSN.substring(0, 32), offset, 'ascii');
        offset += 32;
      }
      if (config.runId) {
        data.write(config.runId.substring(0, 32), offset, 'ascii');
        offset += 32;
      }
      if (config.customer) {
        data.write(config.customer.substring(0, 64), offset, 'utf8');
        offset += 64;
      }
      if (config.district) {
        data.write(config.district.substring(0, 64), offset, 'utf8');
        offset += 64;
      }

      const resp = await this.sendCommand(CMD.INITIALIZE_LOGGER, data.slice(0, offset), 10000);
      return { success: resp.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { ProcyonUsbBridge };
