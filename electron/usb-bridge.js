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
          return desc && desc.idVendor === PROCYON_VID && desc.idProduct === PROCYON_PID;
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
      this.device = usb.getDeviceList().find(d => {
        const desc = d.deviceDescriptor;
        return desc && desc.idVendor === PROCYON_VID && desc.idProduct === PROCYON_PID;
      });

      if (!this.device) {
        return { success: false, error: 'Procyon device not found. Please check USB connection.' };
      }

      // Open device
      try {
        this.device.open();
      } catch (openErr) {
        console.error('[USB] Failed to open device:', openErr.message);
        return { success: false, error: `Failed to open USB device: ${openErr.message}` };
      }

      // Log device info
      const desc = this.device.deviceDescriptor;
      console.log('[USB] Device opened. Configurations:', desc.bNumConfigurations);

      // Get interfaces from the device object
      // In node-usb v2, device.interfaces is the array of Interface objects
      const interfaces = this.device.interfaces;
      console.log('[USB] Number of interfaces:', interfaces ? interfaces.length : 0);

      if (!interfaces || interfaces.length === 0) {
        try { this.device.close(); } catch(e) {}
        this.device = null;
        return { success: false, error: 'No USB interfaces found on device' };
      }

      // Try to claim each interface
      // node-usb v2: iface.id is the interface number, ep.address is endpoint address
      let claimed = false;
      for (let i = 0; i < interfaces.length; i++) {
        const iface = interfaces[i];
        const ifaceId = iface.id !== undefined ? iface.id : i;
        console.log(`[USB] Interface ${i}: id=${ifaceId}`);

        // Log endpoints (use ep.address, not ep.bEndpointAddress)
        if (iface.endpoints && iface.endpoints.length > 0) {
          for (const ep of iface.endpoints) {
            const epAddr = ep.address !== undefined ? `0x${ep.address.toString(16)}` : 'unknown';
            console.log(`[USB]   Endpoint: address=${epAddr} direction=${ep.direction} type=${ep.transferType}`);
          }
        }

        try {
          // Try to detach kernel driver
          try {
            if (iface.isKernelDriverActive()) {
              console.log(`[USB] Kernel driver active on interface ${i}, detaching...`);
              iface.detachKernelDriver();
            }
          } catch (detachErr) {
            console.warn(`[USB] Could not check/detach kernel driver:`, detachErr.message);
          }

          iface.claim();
          this.iface = iface;
          this.interfaceNumber = ifaceId;
          claimed = true;
          console.log(`[USB] Successfully claimed interface ${i} (id=${ifaceId})`);
          break;
        } catch (claimErr) {
          console.warn(`[USB] Failed to claim interface ${i}:`, claimErr.message);
        }
      }

      if (!claimed) {
        // Last resort: try using device.interface() method (older API)
        console.log('[USB] Trying legacy interface access...');
        try {
          this.iface = this.device.interface(0);
          try {
            if (this.iface.isKernelDriverActive()) {
              this.iface.detachKernelDriver();
            }
          } catch (e) {
            console.warn('[USB] Kernel driver detach failed:', e.message);
          }
          this.iface.claim();
          claimed = true;
          this.interfaceNumber = 0;
          console.log('[USB] Successfully claimed interface via legacy API');
        } catch (legacyErr) {
          console.warn('[USB] Legacy interface claim also failed:', legacyErr.message);
        }
      }

      if (!claimed) {
        try { this.device.close(); } catch(e) {}
        this.device = null;
        return { 
          success: false, 
          error: 'Failed to claim USB interface.\n\nPossible fixes:\n1. Reinstall WinUSB driver with Zadig\n2. Unplug and replug USB cable\n3. Close any other software using this device\n4. Try running as Administrator' 
        };
      }

      // Find endpoints from the claimed interface (node-usb v2: use ep.address)
      const endpointList = this.iface.endpoints || [];
      console.log('[USB] Endpoints found:', endpointList.length);

      for (const ep of endpointList) {
        const epAddr = ep.address !== undefined ? `0x${ep.address.toString(16)}` : 'unknown';
        console.log(`[USB] Endpoint: address=${epAddr} direction=${ep.direction} type=${ep.transferType}`);
        if (ep.direction === 'in') {
          this.inEndpoint = ep;
        } else if (ep.direction === 'out') {
          this.outEndpoint = ep;
        }
      }

      if (!this.inEndpoint || !this.outEndpoint) {
        this.iface.release(() => {});
        try { this.device.close(); } catch(e) {}
        this.device = null;
        return { success: false, error: `Could not find USB endpoints. IN: ${!!this.inEndpoint}, OUT: ${!!this.outEndpoint}` };
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
      console.error('[USB] Connection error:', error);
      try {
        if (this.iface) { try { this.iface.release(() => {}); } catch(e) {} }
        if (this.device) { try { this.device.close(); } catch(e) {} }
      } catch (cleanupErr) {
        // ignore
      }
      this.device = null;
      this.iface = null;
      this.inEndpoint = null;
      this.outEndpoint = null;
      this.connected = false;
      return { success: false, error: `USB connection failed: ${error.message}` };
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect() {
    try {
      if (this.inEndpoint) {
        try { this.inEndpoint.stopPoll(); } catch(e) {}
        this.inEndpoint = null;
      }
      if (this.iface) {
        try { this.iface.release(() => {}); } catch(e) {}
        this.iface = null;
      }
      if (this.device) {
        try { this.device.close(); } catch(e) {}
        this.device = null;
      }
      this.outEndpoint = null;
      this.connected = false;
      this.clearPending();
      return { success: true };
    } catch (error) {
      console.error('[USB] Disconnect error:', error);
      this.connected = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Build a command frame
   */
  buildFrame(cmd, data = Buffer.alloc(0)) {
    const dataLen = data.length;
    const frame = Buffer.alloc(5 + dataLen);
    frame[0] = FRAME_HEADER;           // 0x5A
    frame[1] = cmd;                     // Command byte
    frame[2] = (dataLen >> 8) & 0xFF;  // Length high byte
    frame[3] = dataLen & 0xFF;         // Length low byte
    data.copy(frame, 4);               // Data payload
    // Simple checksum: XOR of bytes 1..(4+dataLen-1)
    let checksum = 0;
    for (let i = 1; i < frame.length - 1; i++) {
      checksum ^= frame[i];
    }
    frame[frame.length - 1] = checksum; // Checksum
    frame[frame.length - 1] = FRAME_FOOTER; // Footer
    return frame;
  }

  /**
   * Handle incoming USB data
   */
  handleData(data) {
    this.responseBuffer = Buffer.concat([this.responseBuffer, data]);
    this.processBuffer();
  }

  /**
   * Process response buffer to find complete frames
   */
  processBuffer() {
    while (this.responseBuffer.length >= 5) {
      // Find frame header
      const headerIdx = this.responseBuffer.indexOf(FRAME_HEADER);
      if (headerIdx === -1) {
        this.responseBuffer = Buffer.alloc(0);
        return;
      }
      if (headerIdx > 0) {
        this.responseBuffer = this.responseBuffer.slice(headerIdx);
      }

      if (this.responseBuffer.length < 5) return;

      const cmd = this.responseBuffer[1];
      const dataLen = (this.responseBuffer[2] << 8) | this.responseBuffer[3];
      const totalLen = 5 + dataLen;

      if (this.responseBuffer.length < totalLen) return;

      const frameData = this.responseBuffer.slice(4, 4 + dataLen);
      const footer = this.responseBuffer[totalLen - 1];

      this.responseBuffer = this.responseBuffer.slice(totalLen);

      if (footer === FRAME_FOOTER || footer === CMD.ACK || footer === CMD.NACK) {
        if (this.pendingResolve) {
          const resolve = this.pendingResolve;
          this.pendingResolve = null;
          this.pendingReject = null;
          clearTimeout(this.responseTimeout);
          resolve({ cmd, data: frameData });
        }
      }
    }
  }

  /**
   * Clear pending response
   */
  clearPending() {
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout);
      this.responseTimeout = null;
    }
    if (this.pendingReject) {
      this.pendingReject(new Error('Operation cancelled'));
      this.pendingResolve = null;
      this.pendingReject = null;
    }
    this.responseBuffer = Buffer.alloc(0);
  }

  /**
   * Send command and wait for response
   */
  sendCommand(cmd, data = Buffer.alloc(0), timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.outEndpoint) {
        reject(new Error('Device not connected'));
        return;
      }

      this.clearPending();

      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.responseTimeout = setTimeout(() => {
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(new Error(`Command 0x${cmd.toString(16)} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const frame = this.buildFrame(cmd, data);
      console.log(`[USB] Sending command 0x${cmd.toString(16)}, frame length: ${frame.length}`);

      this.outEndpoint.transfer(frame, (err) => {
        if (err) {
          console.error('[USB] Transfer error:', err.message);
          clearTimeout(this.responseTimeout);
          this.pendingResolve = null;
          this.pendingReject = null;
          reject(new Error(`USB transfer failed: ${err.message}`));
        }
      });
    });
  }

  /**
   * Get firmware version
   */
  async getFirmwareVersion() {
    const resp = await this.sendCommand(CMD.GET_FIRMWARE_VERSION);
    if (resp.data.length >= 2) {
      return `${resp.data[0]}.${resp.data[1]}`;
    }
    return 'Unknown';
  }

  /**
   * Get tool serial number
   */
  async getToolSN() {
    const resp = await this.sendCommand(CMD.GET_TOOL_SN);
    return resp.data.toString('ascii').trim().replace(/\0/g, '');
  }

  /**
   * Get unique ID
   */
  async getUniqueID() {
    const resp = await this.sendCommand(CMD.GET_UNIQUE_ID);
    return resp.data.toString('hex').toUpperCase();
  }

  /**
   * Get battery voltage
   */
  async getBatteryVoltage() {
    const resp = await this.sendCommand(CMD.GET_BATTERY_VOLTAGE);
    if (resp.data.length >= 2) {
      const raw = resp.data.readInt16LE(0);
      return (raw * 0.001027).toFixed(3);
    }
    return '0';
  }

  /**
   * Get temperature
   */
  async getTemperature() {
    const resp = await this.sendCommand(CMD.GET_TEMPERATURE);
    if (resp.data.length >= 2) {
      const raw = resp.data.readInt16LE(0);
      return (raw * 0.03125).toFixed(2);
    }
    return '0';
  }

  /**
   * Set tool SN
   */
  async setToolSN(sn) {
    const data = Buffer.alloc(16);
    data.write(sn.substring(0, 16), 'ascii');
    const resp = await this.sendCommand(CMD.SET_TOOL_SN, data);
    return resp.cmd === CMD.ACK;
  }

  /**
   * Set run ID
   */
  async setRunID(runId) {
    const data = Buffer.alloc(4);
    data.writeInt32LE(runId, 0);
    const resp = await this.sendCommand(CMD.SET_RUN_ID, data);
    return resp.cmd === CMD.ACK;
  }

  /**
   * Set customer
   */
  async setCustomer(customer) {
    const data = Buffer.alloc(32);
    data.write(customer.substring(0, 32), 'utf8');
    const resp = await this.sendCommand(CMD.SET_CUSTOMER, data);
    return resp.cmd === CMD.ACK;
  }

  /**
   * Set district
   */
  async setDistrict(district) {
    const data = Buffer.alloc(32);
    data.write(district.substring(0, 32), 'utf8');
    const resp = await this.sendCommand(CMD.SET_DISTRICT, data);
    return resp.cmd === CMD.ACK;
  }

  /**
   * Set country
   */
  async setCountry(country) {
    const data = Buffer.alloc(32);
    data.write(country.substring(0, 32), 'utf8');
    const resp = await this.sendCommand(CMD.SET_COUNTRY, data);
    return resp.cmd === CMD.ACK;
  }

  /**
   * Set depth out
   */
  async setDepthOut(depth) {
    const data = Buffer.alloc(4);
    data.writeFloatLE(depth, 0);
    const resp = await this.sendCommand(CMD.SET_DEPTH_OUT, data);
    return resp.cmd === CMD.ACK;
  }

  /**
   * Get device info (firmware version, SN, battery, temperature)
   */
  async getDeviceInfo() {
    const firmwareVersion = await this.getFirmwareVersion();
    const toolSN = await this.getToolSN();
    const uniqueID = await this.getUniqueID();
    const batteryVoltage = await this.getBatteryVoltage();
    const temperature = await this.getTemperature();

    return {
      firmwareVersion,
      toolSN,
      uniqueID,
      batteryVoltage: `${batteryVoltage}V`,
      temperature: `${temperature}°C`,
    };
  }

  /**
   * Run self test
   */
  async runSelfTest() {
    await this.sendCommand(CMD.SET_SELF_TEST_MODE);
    // Wait and poll for results
    await new Promise(resolve => setTimeout(resolve, 3000));
    const resp = await this.sendCommand(CMD.GET_SELF_TEST_MODE_STATUS);
    
    // Parse self test results
    const results = [];
    const testNames = [
      'Accelerometer X', 'Accelerometer Y', 'Accelerometer Z',
      'Magnetometer X', 'Magnetometer Y', 'Magnetometer Z',
      'Temperature Sensor', 'Pressure Sensor',
      'Battery Voltage', 'Memory', 'Communication'
    ];
    
    for (let i = 0; i < Math.min(resp.data.length, testNames.length); i++) {
      results.push({
        name: testNames[i] || `Test ${i + 1}`,
        status: resp.data[i] === 1 ? 'pass' : resp.data[i] === 2 ? 'warning' : 'fail',
        message: resp.data[i] === 1 ? 'Passed' : resp.data[i] === 2 ? 'Warning' : 'Failed',
      });
    }
    
    return results;
  }

  /**
   * Download all memory data
   */
  async downloadMemory(onProgress) {
    // Get number of memory partitions
    const partResp = await this.sendCommand(CMD.GET_NUMBER_MEMORY_PARTITIONS);
    const numPartitions = partResp.data[0] || 0;
    
    const allRecords = [];
    const CHUNK_SIZE = 512; // bytes per chunk
    let totalBytesRead = 0;
    
    // Read memory dump in chunks
    for (let partition = 0; partition < numPartitions; partition++) {
      let offset = 0;
      let moreData = true;
      
      while (moreData) {
        const reqData = Buffer.alloc(6);
        reqData.writeInt16LE(partition, 0);
        reqData.writeInt32LE(offset, 2);
        
        try {
          const resp = await this.sendCommand(CMD.GET_MEMORY_DUMP_CHUNK, reqData, 10000);
          
          if (resp.data.length === 0) {
            moreData = false;
            break;
          }
          
          // Parse OneSecondData records (0xA0 records)
          const records = this.parseOneSecondRecords(resp.data);
          allRecords.push(...records);
          
          totalBytesRead += resp.data.length;
          offset += resp.data.length;
          
          if (onProgress) {
            onProgress(totalBytesRead);
          }
          
          // If we got less than a full chunk, we've reached the end
          if (resp.data.length < CHUNK_SIZE) {
            moreData = false;
          }
        } catch (err) {
          console.error('[USB] Memory read error:', err.message);
          moreData = false;
        }
      }
    }
    
    return allRecords;
  }

  /**
   * Parse OneSecondData records from raw data
   */
  parseOneSecondRecords(data) {
    const records = [];
    let offset = 0;
    
    while (offset + 60 <= data.length) { // OneSecondData is ~60 bytes
      if (data[offset] === 0xA0) { // OneSecondData record type
        const record = {};
        const fields = [
          'statusWord', 'temperature', 'batteryVoltage',
          'axShock', 'ayShock', 'azShock',
          'axVibration', 'ayVibration', 'azVibration',
          'mx', 'my', 'mz',
          'rpm', 'pressure', 'inclination',
          'mgtf', 'magRef',
        ];
        
        for (let i = 0; i < fields.length && (offset + 2 + i * 2) < data.length; i++) {
          const raw = data.readInt16LE(offset + 2 + i * 2);
          record[fields[i]] = raw;
        }
        
        // Apply conversion factors
        if (record.temperature !== undefined) {
          record.temperatureC = (record.temperature * 0.03125).toFixed(2);
        }
        if (record.batteryVoltage !== undefined) {
          record.batteryV = (record.batteryVoltage * 0.001027).toFixed(3);
        }
        if (record.rpm !== undefined) {
          record.rpmValue = (record.rpm * 0.02333).toFixed(2);
        }
        if (record.axShock !== undefined) {
          record.axShockG = (record.axShock * 0.000244).toFixed(4);
        }
        if (record.ayShock !== undefined) {
          record.ayShockG = (record.ayShock * 0.000244).toFixed(4);
        }
        if (record.azShock !== undefined) {
          record.azShockG = (record.azShock * 0.000244).toFixed(4);
        }
        
        record.timestamp = records.length; // Index as timestamp placeholder
        records.push(record);
        offset += 60;
      } else {
        offset++;
      }
    }
    
    return records;
  }

  /**
   * Export data to CSV
   */
  exportToCSV(records) {
    if (!records || records.length === 0) return '';
    
    const headers = ['Timestamp', 'Temperature(C)', 'Battery(V)', 'RPM', 
                     'AxShock(g)', 'AyShock(g)', 'AzShock(g)',
                     'AxVib', 'AyVib', 'AzVib',
                     'Mx', 'My', 'Mz', 'Pressure', 'Inclination'];
    
    const rows = records.map((r, i) => [
      i + 1,
      r.temperatureC || '',
      r.batteryV || '',
      r.rpmValue || '',
      r.axShockG || '',
      r.ayShockG || '',
      r.azShockG || '',
      r.axVibration || '',
      r.ayVibration || '',
      r.azVibration || '',
      r.mx || '',
      r.my || '',
      r.mz || '',
      r.pressure || '',
      r.inclination || '',
    ].join(','));
    
    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Diagnose USB devices - returns detailed info
   */
  diagnose() {
    try {
      const devices = usb.getDeviceList();
      const result = {
        totalDevices: devices.length,
        devices: [],
        procyonDetail: null,
        rawDebug: [],
      };

      for (const d of devices) {
        // node-usb v2: try multiple ways to get VID/PID
        let vid, pid, addr;
        try {
          // Method 1: deviceDescriptor (standard v2)
          const desc = d.deviceDescriptor;
          if (desc) {
            vid = desc.idVendor;
            pid = desc.idProduct;
          }
        } catch(e) {}
        
        try {
          // Method 2: direct properties (v1 compat)
          if (vid === undefined) vid = d.vendorId;
          if (pid === undefined) pid = d.productId;
        } catch(e) {}
        
        try {
          // Method 3: busNumber/deviceAddress
          if (vid === undefined && d.deviceDescriptor) {
            const desc = d.deviceDescriptor;
            vid = desc.idVendor || desc.bDeviceClass;
          }
        } catch(e) {}

        try { addr = d.deviceAddress; } catch(e) {}
        
        const isProcyon = vid === PROCYON_VID && pid === PROCYON_PID;
        const info = {
          vid: vid !== undefined ? `0x${vid.toString(16).padStart(4, '0')}` : 'undefined',
          pid: pid !== undefined ? `0x${pid.toString(16).padStart(4, '0')}` : 'undefined',
          address: addr !== undefined ? addr : 'undefined',
          isProcyon,
        };
        result.devices.push(info);

        // Debug: log raw device object keys for first device
        if (result.rawDebug.length < 2) {
          result.rawDebug.push({
            keys: Object.keys(d).join(', '),
            hasDeviceDescriptor: !!d.deviceDescriptor,
            descriptorKeys: d.deviceDescriptor ? Object.keys(d.deviceDescriptor).join(', ') : 'none',
            vendorId_prop: d.vendorId,
            productId_prop: d.productId,
            deviceAddress_prop: d.deviceAddress,
            busNumber_prop: d.busNumber,
          });
        }

        if (isProcyon) {
          const procyonDetail = {
            ...info,
            canOpen: false,
            openError: null,
            interfaces: [],
            interfacesDebug: null,
          };

          // Try to open and check interfaces
          try {
            d.open();
            procyonDetail.canOpen = true;

            // Debug: check what's available after open
            procyonDetail.interfacesDebug = {
              hasInterfaces: !!d.interfaces,
              interfacesType: typeof d.interfaces,
              interfacesLength: d.interfaces ? d.interfaces.length : 'N/A',
              hasInterfaceMethod: typeof d.interface === 'function',
              deviceKeysAfterOpen: Object.keys(d).join(', '),
            };

            // Try device.interfaces array (v2)
            const ifaces = d.interfaces;
            if (ifaces && ifaces.length > 0) {
              for (const iface of ifaces) {
                const ifaceId = iface.id !== undefined ? iface.id : 'unknown';
                const ifaceInfo = {
                  id: ifaceId,
                  altSetting: iface.altSetting,
                  endpoints: [],
                  canClaim: false,
                  claimError: null,
                  kernelDriverActive: false,
                };

                // Safely get endpoint info
                try {
                  if (iface.endpoints && iface.endpoints.length > 0) {
                    for (const ep of iface.endpoints) {
                      ifaceInfo.endpoints.push({
                        address: ep.address !== undefined ? `0x${ep.address.toString(16)}` : 'unknown',
                        direction: ep.direction || 'unknown',
                        transferType: ep.transferType !== undefined ? ep.transferType : 'unknown',
                      });
                    }
                  }
                } catch (epErr) {
                  ifaceInfo.endpoints = `error: ${epErr.message}`;
                }

                // Check kernel driver
                try {
                  ifaceInfo.kernelDriverActive = iface.isKernelDriverActive();
                } catch (e) {
                  ifaceInfo.kernelDriverActive = `error: ${e.message}`;
                }

                // Try to claim
                try {
                  iface.claim();
                  ifaceInfo.canClaim = true;
                  iface.release(() => {});
                } catch (claimErr) {
                  ifaceInfo.claimError = claimErr.message;
                }

                procyonDetail.interfaces.push(ifaceInfo);
              }
            }

            d.close();
          } catch (openErr) {
            procyonDetail.openError = openErr.message;
          }

          result.procyonDetail = procyonDetail;
        }
      }

      return result;
    } catch (error) {
      return { error: error.message };
    }
  }
}

// Singleton instance
const bridge = new ProcyonUsbBridge();

module.exports = { bridge, PROCYON_VID, PROCYON_PID };
