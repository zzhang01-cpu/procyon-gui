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

  // Data operations
  ipcMain.handle('device:get-memory-partitions', async () => {
    return bridge.getMemoryPartitions();
  });

  ipcMain.handle('device:get-memory-erase-percent', async () => {
    return bridge.getMemoryErasePercent();
  });

  ipcMain.handle('device:download-data', async (_event, options) => {
    return bridge.downloadOneSecondData(options);
  });

  // Test operations
  ipcMain.handle('device:run-self-test', async () => {
    return bridge.runSelfTest();
  });

  // Sensor readings
  ipcMain.handle('device:get-battery-voltage', async () => {
    return bridge.getBatteryVoltage();
  });

  ipcMain.handle('device:get-temperature', async () => {
    return bridge.getTemperature();
  });

  // Logger initialization
  ipcMain.handle('device:initialize-logger', async (_event, config) => {
    return bridge.initializeLogger(config);
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
