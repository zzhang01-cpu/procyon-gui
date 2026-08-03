const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { bridge, PROCYON_VID, PROCYON_PID } = require('./usb-bridge');

// UDL v8 libusb-1.0 bridge (for new firmware devices)
let udlBridge = null;
let udlSupported = false;
try {
  const udl = require('./usb-bridge-v1');
  udlSupported = udl.supported;
  if (udlSupported) {
    const { UdlUsbBridge } = udl;
    udlBridge = new UdlUsbBridge();
    console.log('[UDL] libusb-1.0 bridge loaded successfully');
  } else {
    console.log('[UDL] libusb-1.0 not available: ' + (udl.error || 'unknown'));
  }
} catch (e) {
  console.log('[UDL] Failed to load libusb-1.0 bridge: ' + e.message);
}

// Active bridge (legacy or UDL)
let activeBridge = bridge;
let activeBridgeType = 'legacy'; // 'legacy' or 'udl'

// Auto-detect which bridge to use
function detectBridge() {
  // Try UDL first (new firmware), fall back to legacy
  if (udlSupported && udlBridge) {
    try {
      var result = require('./usb-bridge-v1').findKnownDevices();
      if (result && result.devices && result.devices.length > 0) {
        activeBridge = udlBridge;
        activeBridgeType = 'udl';
        console.log('[Bridge] Auto-selected UDL (libusb-1.0) bridge');
        return 'udl';
      }
    } catch (e) {
      console.log('[Bridge] UDL auto-detect failed: ' + e.message);
    }
  }
  // Fall back to legacy
  activeBridge = bridge;
  activeBridgeType = 'legacy';
  console.log('[Bridge] Using legacy (libusb0) bridge');
  return 'legacy';
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Procyon CM GUI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In development, load from Next.js dev server
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:5000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from static export
    mainWindow.loadFile(path.join(__dirname, '..', 'out', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize USB bridge IPC handlers
function initUsbBridge() {
  console.log('[Procyon GUI] USB Bridge version: 2024-06-29-v49 (device params in file naming, csv_chain chain validation)');
  console.log('[Procyon GUI] UDL v8 support: ' + (udlSupported ? 'enabled' : 'disabled'));

  // -- Bridge management (new) --
  ipcMain.handle('bridge:get-info', async () => {
    return {
      legacy: { available: true },
      udl: { available: udlSupported },
      active: activeBridgeType,
    };
  });

  ipcMain.handle('bridge:switch', async (_event, bridgeType) => {
    if (bridgeType === 'udl' && !udlSupported) {
      return { success: false, error: 'UDL bridge not available' };
    }
    // Disconnect current bridge first
    try {
      if (activeBridge && activeBridge.isConnected && activeBridge.isConnected()) {
        await activeBridge.disconnect();
      }
    } catch (e) {
      console.log('[Bridge] Error disconnecting: ' + e.message);
    }
    if (bridgeType === 'udl') {
      activeBridge = udlBridge;
      activeBridgeType = 'udl';
    } else {
      activeBridge = bridge;
      activeBridgeType = 'legacy';
    }
    console.log('[Bridge] Switched to ' + activeBridgeType);
    return { success: true, active: activeBridgeType };
  });

  ipcMain.handle('bridge:list-all-devices', async () => {
    var all = [];
    // Legacy devices
    try {
      var legacyDevs = legacyBridge.listDevices();
      if (legacyDevs && Array.isArray(legacyDevs)) {
        for (var i = 0; i < legacyDevs.length; i++) {
          all.push({ ...legacyDevs[i], bridge: 'legacy' });
        }
      }
    } catch (e) {
      console.log('[Bridge] Legacy list error: ' + e.message);
    }
    // UDL devices
    if (udlSupported) {
      try {
        var udlResult = require('./usb-bridge-v1').findKnownDevices();
        if (udlResult && udlResult.devices) {
          for (var j = 0; j < udlResult.devices.length; j++) {
            all.push({ ...udlResult.devices[j], bridge: 'udl' });
          }
          if (udlResult.listPtr) {
            require('./usb-bridge-v1').freeDeviceList(udlResult.listPtr);
          }
        }
      } catch (e) {
        console.log('[Bridge] UDL list error: ' + e.message);
      }
    }
    return all;
  });

  // List USB devices
  ipcMain.handle('usb:list-devices', async () => {
    return activeBridge.listDevices();
  });

  // Connect to device
  ipcMain.handle('usb:connect', async () => {
    return activeBridge.connect();
  });

  // Disconnect from device
  ipcMain.handle('usb:disconnect', async () => {
    return activeBridge.disconnect();
  });

  // Diagnose USB connection
  ipcMain.handle('usb:diagnose', async () => {
    try {
      if (typeof activeBridge.diagnose === 'function') {
        return { success: true, ...activeBridge.diagnose() };
      }
      return { success: true, bridgeType: activeBridgeType, connected: activeBridge.isConnected ? activeBridge.isConnected() : false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get connection status
  ipcMain.handle('device:is-connected', async () => {
    if (typeof activeBridge.isConnected === 'function') {
      return activeBridge.isConnected();
    }
    return !!activeBridge.connected;
  });

  // Get device info (firmware, SN, battery, temperature)
  ipcMain.handle('device:get-info', async () => {
    if (typeof activeBridge.getDeviceInfo === 'function') {
      return activeBridge.getDeviceInfo();
    }
    return { success: false, error: 'Not implemented on this bridge' };
  });

  // Refresh device info
  ipcMain.handle('device:refresh-info', async () => {
    if (typeof activeBridge.getDeviceInfo === 'function') {
      return activeBridge.getDeviceInfo();
    }
    return { success: false, error: 'Not implemented on this bridge' };
  });

  // Parameter setters
  ipcMain.handle('device:set-tool-sn', async (_event, sn) => {
    return activeBridge.setToolSN(sn);
  });

  ipcMain.handle('device:set-run-id', async (_event, runId) => {
    return activeBridge.setRunID(runId);
  });

  ipcMain.handle('device:set-customer', async (_event, customer) => {
    return activeBridge.setCustomer(customer);
  });

  ipcMain.handle('device:set-district', async (_event, district) => {
    return activeBridge.setDistrict(district);
  });

  ipcMain.handle('device:set-country', async (_event, country) => {
    return activeBridge.setCountry(country);
  });

  ipcMain.handle('device:set-depth-out', async (_event, depth) => {
    return activeBridge.setDepthOut(depth);
  });

  ipcMain.handle('device:set-ldap', async (_event, ldap) => {
    return activeBridge.setLDAP(ldap);
  });

  ipcMain.handle('device:set-unique-id', async (_event, uniqueId) => {
    return activeBridge.setUniqueID(uniqueId);
  });

  ipcMain.handle('device:set-tool-type', async (_event, toolType) => {
    return activeBridge.setToolType(toolType);
  });

  ipcMain.handle('device:set-tool-position', async (_event, position) => {
    return activeBridge.setToolPosition(position);
  });

  ipcMain.handle('device:set-tool-size', async (_event, size) => {
    return activeBridge.setToolSize(size);
  });

  ipcMain.handle('device:set-config-name', async (_event, configName) => {
    return activeBridge.setConfigName(configName);
  });

  ipcMain.handle('device:set-run-id-type', async (_event, runIdType) => {
    return activeBridge.setRunIDType(runIdType);
  });

  ipcMain.handle('device:set-uh-connection-type', async (_event, connType) => {
    return activeBridge.setUHConnectionType(connType);
  });

  ipcMain.handle('device:set-dh-connection-type', async (_event, connType) => {
    return activeBridge.setDHConnectionType(connType);
  });

  ipcMain.handle('device:set-int-pressure-sn', async (_event, sn) => {
    return activeBridge.setIntPressureSN(sn);
  });

  ipcMain.handle('device:set-ext-pressure-sn', async (_event, sn) => {
    return activeBridge.setExtPressureSN(sn);
  });

  ipcMain.handle('device:set-limpet-sn', async (_event, sn) => {
    return activeBridge.setLimpetSN(sn);
  });

  ipcMain.handle('device:set-device-time', async (_event, date) => {
    return activeBridge.setDeviceTime(date);
  });

  ipcMain.handle('device:write-into-flash', async () => {
    return activeBridge.writeIntoFlash();
  });

  ipcMain.handle('device:set-init-parameters', async (_event, params) => {
    return activeBridge.setInitParameters(params);
  });

  ipcMain.handle('device:set-tool-axial-position', async (_event, axial) => {
    return activeBridge.setToolAxialPosition(axial);
  });

  // Memory operations
  ipcMain.handle('device:erase-used-memory', async () => {
    return activeBridge.eraseUsedMemory();
  });

  ipcMain.handle('device:erase-all-memory', async () => {
    return activeBridge.eraseAllMemory();
  });

  // Data operations
  ipcMain.handle('device:get-memory-partitions', async () => {
    return activeBridge.getMemoryPartitions();
  });

  ipcMain.handle('device:get-memory-erase-percent', async () => {
    return activeBridge.getMemoryErasePercent();
  });

  ipcMain.handle('device:download-data', async (_event, options) => {
    return activeBridge.downloadData(function(progress) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download:progress', progress);
      }
    });
  });
  ipcMain.handle('device:get-parsed-records', async (_event, offset, limit) => {
    return activeBridge.getParsedRecords(offset, limit);
  });
  ipcMain.handle('device:export-records-csv', async () => {
    return activeBridge.exportRecordsCsv();
  });
  ipcMain.handle('device:save-records-csv', async (_event, defaultPath) => {
    return activeBridge.saveRecordsCsv(defaultPath);
  });
  ipcMain.handle('device:export-all-records-csv', async () => {
    return activeBridge.exportAllRecordsCsv();
  });

  // Test operations
  ipcMain.handle('device:run-self-test', async (_event, tests) => {
    return activeBridge.runSelfTest(tests, function(progress) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('selftest:progress', progress);
      }
    });
  });

  // Launch device (delayed start)
  ipcMain.handle('device:launch-device', async (_event, delaySeconds) => {
    return activeBridge.launchDevice(delaySeconds);
  });

  // Erase memory with progress
  ipcMain.handle('device:erase-memory', async (_event, eraseAll) => {
    return activeBridge.eraseMemory(eraseAll);
  });

  // Sensor readings
  ipcMain.handle('device:get-battery-voltage', async () => {
    return activeBridge.getBatteryVoltage();
  });

  ipcMain.handle('device:get-temperature', async () => {
    return activeBridge.getTemperature();
  });

  // Logger initialization
  ipcMain.handle('device:initialize-logger', async (_event, params, eraseMemory) => {
    return activeBridge.initializeLogger(params, eraseMemory, function(progress) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('init:progress', progress);
      }
    });
  });

  // Get all parameters at once
  ipcMain.handle('device:get-all-parameters', async () => {
    return activeBridge.getAllParameters();
  });

  // Get real-time sensor data
  ipcMain.handle('device:get-sensor-data', async () => {
    return activeBridge.getSensorData();
  });
}

app.whenReady().then(() => {
  initUsbBridge();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup on quit
app.on('before-quit', async () => {
  if (activeBridge && activeBridge.isConnected && activeBridge.isConnected()) {
    await activeBridge.disconnect();
  }
});
