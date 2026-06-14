const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // USB device operations
  listDevices: () => ipcRenderer.invoke('usb:list-devices'),
  connect: () => ipcRenderer.invoke('usb:connect'),
  disconnect: () => ipcRenderer.invoke('usb:disconnect'),
  diagnose: () => ipcRenderer.invoke('usb:diagnose'),

  // Device info
  getDeviceInfo: () => ipcRenderer.invoke('device:get-info'),
  isConnected: () => ipcRenderer.invoke('device:is-connected'),

  // Parameter commands
  setToolSN: (sn) => ipcRenderer.invoke('device:set-tool-sn', sn),
  setRunID: (runId) => ipcRenderer.invoke('device:set-run-id', runId),
  setCustomer: (customer) => ipcRenderer.invoke('device:set-customer', customer),
  setDistrict: (district) => ipcRenderer.invoke('device:set-district', district),
  setCountry: (country) => ipcRenderer.invoke('device:set-country', country),
  setDepthOut: (depth) => ipcRenderer.invoke('device:set-depth-out', depth),

  // Data operations
  getMemoryPartitions: () => ipcRenderer.invoke('device:get-memory-partitions'),
  getMemoryErasePercent: () => ipcRenderer.invoke('device:get-memory-erase-percent'),
  downloadData: (options) => ipcRenderer.invoke('device:download-data', options),

  // Test operations
  runSelfTest: () => ipcRenderer.invoke('device:run-self-test'),

  // Sensor readings
  getBatteryVoltage: () => ipcRenderer.invoke('device:get-battery-voltage'),
  getTemperature: () => ipcRenderer.invoke('device:get-temperature'),

  // Logger
  initializeLogger: (config) => ipcRenderer.invoke('device:initialize-logger', config),
});
