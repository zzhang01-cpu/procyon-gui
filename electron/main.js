const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { bridge, PROCYON_VID, PROCYON_PID } = require('./usb-bridge');

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
  console.log('[Procyon GUI] USB Bridge version: 2024-06-22-v39 (fixed record boundary, timestamp from record offset, multi-CSV)');

  // List USB devices
  ipcMain.handle('usb:list-devices', async () => {
    return bridge.listDevices();
  });

  // Connect to device
  ipcMain.handle('usb:connect', async () => {
    return bridge.connect();
  });

  // Disconnect from device
  ipcMain.handle('usb:disconnect', async () => {
    return bridge.disconnect();
  });

  // Diagnose USB connection
  ipcMain.handle('usb:diagnose', async () => {
    try {
      return { success: true, ...bridge.diagnose() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get connection status
  ipcMain.handle('device:is-connected', async () => {
    return bridge.isConnected();
  });

  // Get device info (firmware, SN, battery, temperature)
  ipcMain.handle('device:get-info', async () => {
    return bridge.getDeviceInfo();
  });

  // Refresh device info (same as get-info but for explicit refresh calls)
  ipcMain.handle('device:refresh-info', async () => {
    return bridge.getDeviceInfo();
  });

  // Parameter setters
  ipcMain.handle('device:set-tool-sn', async (_event, sn) => {
    return bridge.setToolSN(sn);
  });

  ipcMain.handle('device:set-run-id', async (_event, runId) => {
    return bridge.setRunID(runId);
  });

  ipcMain.handle('device:set-customer', async (_event, customer) => {
    return bridge.setCustomer(customer);
  });

  ipcMain.handle('device:set-district', async (_event, district) => {
    return bridge.setDistrict(district);
  });

  ipcMain.handle('device:set-country', async (_event, country) => {
    return bridge.setCountry(country);
  });

  ipcMain.handle('device:set-depth-out', async (_event, depth) => {
    return bridge.setDepthOut(depth);
  });

  ipcMain.handle('device:set-ldap', async (_event, ldap) => {
    return bridge.setLDAP(ldap);
  });

  ipcMain.handle('device:set-unique-id', async (_event, uniqueId) => {
    return bridge.setUniqueID(uniqueId);
  });

  ipcMain.handle('device:set-tool-type', async (_event, toolType) => {
    return bridge.setToolType(toolType);
  });

  ipcMain.handle('device:set-tool-position', async (_event, position) => {
    return bridge.setToolPosition(position);
  });

  ipcMain.handle('device:set-tool-size', async (_event, size) => {
    return bridge.setToolSize(size);
  });

  ipcMain.handle('device:set-config-name', async (_event, configName) => {
    return bridge.setConfigName(configName);
  });

  ipcMain.handle('device:set-run-id-type', async (_event, runIdType) => {
    return bridge.setRunIDType(runIdType);
  });

  ipcMain.handle('device:set-uh-connection-type', async (_event, connType) => {
    return bridge.setUHConnectionType(connType);
  });

  ipcMain.handle('device:set-dh-connection-type', async (_event, connType) => {
    return bridge.setDHConnectionType(connType);
  });

  ipcMain.handle('device:set-int-pressure-sn', async (_event, sn) => {
    return bridge.setIntPressureSN(sn);
  });

  ipcMain.handle('device:set-ext-pressure-sn', async (_event, sn) => {
    return bridge.setExtPressureSN(sn);
  });

  ipcMain.handle('device:set-limpet-sn', async (_event, sn) => {
    return bridge.setLimpetSN(sn);
  });

  ipcMain.handle('device:set-device-time', async (_event, date) => {
    return bridge.setDeviceTime(date);
  });

  ipcMain.handle('device:write-into-flash', async () => {
    return bridge.writeIntoFlash();
  });

  ipcMain.handle('device:set-init-parameters', async (_event, params) => {
    return bridge.setInitParameters(params);
  });

  ipcMain.handle('device:set-tool-axial-position', async (_event, axial) => {
    return bridge.setToolAxialPosition(axial);
  });

  // Memory operations
  ipcMain.handle('device:erase-used-memory', async () => {
    return bridge.eraseUsedMemory();
  });

  ipcMain.handle('device:erase-all-memory', async () => {
    return bridge.eraseAllMemory();
  });

  // Data operations
  ipcMain.handle('device:get-memory-partitions', async () => {
    return bridge.getMemoryPartitions();
  });

  ipcMain.handle('device:get-memory-erase-percent', async () => {
    return bridge.getMemoryErasePercent();
  });

  ipcMain.handle('device:download-data', async (_event, options) => {
    return bridge.downloadData(function(progress) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download:progress', progress);
      }
    });
  });
  ipcMain.handle('device:get-parsed-records', async (_event, offset, limit) => {
    return bridge.getParsedRecords(offset, limit);
  });
  ipcMain.handle('device:export-records-csv', async () => {
    return bridge.exportRecordsCsv();
  });
  ipcMain.handle('device:save-records-csv', async (_event, defaultPath) => {
    return bridge.saveRecordsCsv(defaultPath);
  });

  // Test operations
  ipcMain.handle('device:run-self-test', async (_event, tests) => {
    return bridge.runSelfTest(tests, function(progress) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('selftest:progress', progress);
      }
    });
  });

  // Launch device (delayed start)
  ipcMain.handle('device:launch-device', async (_event, delaySeconds) => {
    return bridge.launchDevice(delaySeconds);
  });

  // Erase memory with progress
  ipcMain.handle('device:erase-memory', async (_event, eraseAll) => {
    return bridge.eraseMemory(eraseAll);
  });

  // Sensor readings
  ipcMain.handle('device:get-battery-voltage', async () => {
    return bridge.getBatteryVoltage();
  });

  ipcMain.handle('device:get-temperature', async () => {
    return bridge.getTemperature();
  });

  // Logger initialization
  ipcMain.handle('device:initialize-logger', async (_event, params, eraseMemory) => {
    return bridge.initializeLogger(params, eraseMemory, function(progress) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('init:progress', progress);
      }
    });
  });

  // Get all parameters at once
  ipcMain.handle('device:get-all-parameters', async () => {
    return bridge.getAllParameters();
  });

  // Get real-time sensor data
  ipcMain.handle('device:get-sensor-data', async () => {
    return bridge.getSensorData();
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
  if (bridge && bridge.isConnected()) {
    await bridge.disconnect();
  }
});
