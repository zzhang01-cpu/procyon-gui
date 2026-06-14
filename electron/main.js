const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { bridge, PROCYON_VID, PROCYON_PID } = require('./usb-bridge');

let mainWindow = null;
let usbBridge = null;

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

// Initialize USB bridge
function initUsbBridge() {
  usbBridge = bridge;

  // List USB devices
  ipcMain.handle('usb:list-devices', async () => {
    return usbBridge.listDevices();
  });

  // Connect to device
  ipcMain.handle('usb:connect', async () => {
    return usbBridge.connect();
  });

  // Disconnect from device
  ipcMain.handle('usb:disconnect', async () => {
    return usbBridge.disconnect();
  });

  // Get device info
  ipcMain.handle('device:get-info', async () => {
    return usbBridge.getDeviceInfo();
  });

  // Set tool serial number
  ipcMain.handle('device:set-tool-sn', async (_event, sn) => {
    return usbBridge.setToolSN(sn);
  });

  // Set run ID
  ipcMain.handle('device:set-run-id', async (_event, runId) => {
    return usbBridge.setRunID(runId);
  });

  // Set customer
  ipcMain.handle('device:set-customer', async (_event, customer) => {
    return usbBridge.setCustomer(customer);
  });

  // Set district
  ipcMain.handle('device:set-district', async (_event, district) => {
    return usbBridge.setDistrict(district);
  });

  // Set country
  ipcMain.handle('device:set-country', async (_event, country) => {
    return usbBridge.setCountry(country);
  });

  // Set depth out
  ipcMain.handle('device:set-depth-out', async (_event, depth) => {
    return usbBridge.setDepthOut(depth);
  });

  // Get memory partitions count
  ipcMain.handle('device:get-memory-partitions', async () => {
    return usbBridge.getMemoryPartitions();
  });

  // Get memory erase percent
  ipcMain.handle('device:get-memory-erase-percent', async () => {
    return usbBridge.getMemoryErasePercent();
  });

  // Download one second data
  ipcMain.handle('device:download-data', async (_event, options) => {
    return usbBridge.downloadOneSecondData(options);
  });

  // Run self test
  ipcMain.handle('device:run-self-test', async () => {
    return usbBridge.runSelfTest();
  });

  // Get battery voltage
  ipcMain.handle('device:get-battery-voltage', async () => {
    return usbBridge.getBatteryVoltage();
  });

  // Get temperature
  ipcMain.handle('device:get-temperature', async () => {
    return usbBridge.getTemperature();
  });

  // Diagnose USB - list ALL devices and detailed Procyon info
  ipcMain.handle('usb:diagnose', async () => {
    try {
      return { success: true, ...usbBridge.diagnose() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get connection status
  ipcMain.handle('device:is-connected', async () => {
    return usbBridge.connected;
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
  if (usbBridge) {
    await usbBridge.disconnect();
  }
});
