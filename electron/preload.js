const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // USB device operations
  listDevices: () => ipcRenderer.invoke('usb:list-devices'),
  connect: () => ipcRenderer.invoke('usb:connect'),
  disconnect: () => ipcRenderer.invoke('usb:disconnect'),
  diagnose: () => ipcRenderer.invoke('usb:diagnose'),

  // Device info
  getDeviceInfo: () => ipcRenderer.invoke('device:get-info'),
  refreshDeviceInfo: () => ipcRenderer.invoke('device:refresh-info'),
  isConnected: () => ipcRenderer.invoke('device:is-connected'),

  // Parameter SET commands
  setToolSN: (sn) => ipcRenderer.invoke('device:set-tool-sn', sn),
  setRunID: (runId) => ipcRenderer.invoke('device:set-run-id', runId),
  setRunIDType: (runIdType) => ipcRenderer.invoke('device:set-run-id-type', runIdType),
  setCustomer: (customer) => ipcRenderer.invoke('device:set-customer', customer),
  setDistrict: (district) => ipcRenderer.invoke('device:set-district', district),
  setCountry: (country) => ipcRenderer.invoke('device:set-country', country),
  setDepthOut: (depth) => ipcRenderer.invoke('device:set-depth-out', depth),
  setLDAP: (ldap) => ipcRenderer.invoke('device:set-ldap', ldap),
  setUniqueID: (uniqueId) => ipcRenderer.invoke('device:set-unique-id', uniqueId),
  setToolType: (toolType) => ipcRenderer.invoke('device:set-tool-type', toolType),
  setToolPosition: (position) => ipcRenderer.invoke('device:set-tool-position', position),
  setToolSize: (size) => ipcRenderer.invoke('device:set-tool-size', size),
  setToolAxialPosition: (axial) => ipcRenderer.invoke('device:set-tool-axial-position', axial),
  setConfigName: (configName) => ipcRenderer.invoke('device:set-config-name', configName),
  setUHConnectionType: (connType) => ipcRenderer.invoke('device:set-uh-connection-type', connType),
  setDHConnectionType: (connType) => ipcRenderer.invoke('device:set-dh-connection-type', connType),
  setIntPressureSN: (sn) => ipcRenderer.invoke('device:set-int-pressure-sn', sn),
  setExtPressureSN: (sn) => ipcRenderer.invoke('device:set-ext-pressure-sn', sn),
  setLimpetSN: (sn) => ipcRenderer.invoke('device:set-limpet-sn', sn),
  setDeviceTime: (date) => ipcRenderer.invoke('device:set-device-time', date),

  // Flash write
  writeIntoFlash: () => ipcRenderer.invoke('device:write-into-flash'),

  // Batch init parameters
  setInitParameters: (params) => ipcRenderer.invoke('device:set-init-parameters', params),

  // Data operations
  getMemoryPartitions: () => ipcRenderer.invoke('device:get-memory-partitions'),
  getMemoryErasePercent: () => ipcRenderer.invoke('device:get-memory-erase-percent'),
  downloadData: (options) => ipcRenderer.invoke('device:download-data', options),
  getParsedRecords: (offset, limit) => ipcRenderer.invoke('device:get-parsed-records', offset, limit),
  exportRecordsCsv: () => ipcRenderer.invoke('device:export-records-csv'),

  // Memory operations
  eraseUsedMemory: () => ipcRenderer.invoke('device:erase-used-memory'),
  eraseAllMemory: () => ipcRenderer.invoke('device:erase-all-memory'),
  eraseMemory: (eraseAll) => ipcRenderer.invoke('device:erase-memory', eraseAll),

  // Test operations
  runSelfTest: (tests) => ipcRenderer.invoke('device:run-self-test', tests),

  // Launch device (delayed start)
  launchDevice: (delaySeconds) => ipcRenderer.invoke('device:launch-device', delaySeconds),

  // Sensor readings
  getBatteryVoltage: () => ipcRenderer.invoke('device:get-battery-voltage'),
  getTemperature: () => ipcRenderer.invoke('device:get-temperature'),

  // Logger
  initializeLogger: (params, eraseMemory) => ipcRenderer.invoke('device:initialize-logger', params, eraseMemory),

  // Get all parameters at once
  getAllParameters: () => ipcRenderer.invoke('device:get-all-parameters'),

  // Get real-time sensor data
  getSensorData: () => ipcRenderer.invoke('device:get-sensor-data'),

  // Progress event listeners
  onDownloadProgress: (callback) => {
    var handler = function(_event, data) { callback(data); };
    ipcRenderer.on('download:progress', handler);
    return function() { ipcRenderer.removeListener('download:progress', handler); };
  },
  onSelfTestProgress: (callback) => {
    var handler = function(_event, data) { callback(data); };
    ipcRenderer.on('selftest:progress', handler);
    return function() { ipcRenderer.removeListener('selftest:progress', handler); };
  },
  onInitProgress: (callback) => {
    var handler = function(_event, data) { callback(data); };
    ipcRenderer.on('init:progress', handler);
    return function() { ipcRenderer.removeListener('init:progress', handler); };
  },
});
