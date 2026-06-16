/**
 * Standalone USB diagnostic script for Procyon CM
 * Run: node electron/usb-diag.js
 * 
 * This script dumps all USB device info to help debug interface detection issues.
 */
const usb = require('usb');

const PROCYON_VID = 0x2269;
const PROCYON_PID = 0xBEEF;

console.log('=== Procyon USB Diagnostic Tool ===\n');

// List all devices
const devices = usb.getDeviceList();
console.log(`Total USB devices: ${devices.length}\n`);

// Find Procyon
const procyon = devices.find(d => {
  const desc = d.deviceDescriptor;
  return desc && desc.idVendor === PROCYON_VID && desc.idProduct === PROCYON_PID;
});

if (!procyon) {
  console.log('ERROR: Procyon CM device NOT found!');
  console.log('All devices:');
  devices.forEach((d, i) => {
    const desc = d.deviceDescriptor;
    console.log(`  [${i}] VID=0x${desc.idVendor.toString(16)} PID=0x${desc.idProduct.toString(16)} addr=${d.deviceAddress}`);
  });
  process.exit(1);
}

console.log('Found Procyon CM device!\n');

// Device descriptor
const desc = procyon.deviceDescriptor;
console.log('--- Device Descriptor ---');
console.log(`  bDeviceClass: 0x${desc.bDeviceClass.toString(16)}`);
console.log(`  bDeviceSubClass: 0x${desc.bDeviceSubClass.toString(16)}`);
console.log(`  bDeviceProtocol: 0x${desc.bDeviceProtocol.toString(16)}`);
console.log(`  idVendor: 0x${desc.idVendor.toString(16)}`);
console.log(`  idProduct: 0x${desc.idProduct.toString(16)}`);
console.log(`  bNumConfigurations: ${desc.bNumConfigurations}`);
console.log(`  deviceAddress: ${procyon.deviceAddress}`);
console.log(`  busNumber: ${procyon.busNumber}`);
console.log();

// All config descriptors (before open)
console.log('--- Config Descriptors (before open) ---');
try {
  const configs = procyon.allConfigDescriptors;
  if (configs) {
    for (let c = 0; c < configs.length; c++) {
      const cfg = configs[c];
      console.log(`\nConfig ${c}:`);
      console.log(`  bConfigurationValue: ${cfg.bConfigurationValue}`);
      console.log(`  bNumInterfaces: ${cfg.bNumInterfaces}`);
      if (cfg.interfaces) {
        for (let i = 0; i < cfg.interfaces.length; i++) {
          const ifaceArr = cfg.interfaces[i];
          for (let a = 0; a < ifaceArr.length; a++) {
            const alt = ifaceArr[a];
            console.log(`  Interface ${i} alt ${a}:`);
            console.log(`    bInterfaceClass: 0x${alt.bInterfaceClass.toString(16)}`);
            console.log(`    bInterfaceSubClass: 0x${alt.bInterfaceSubClass.toString(16)}`);
            console.log(`    bInterfaceProtocol: 0x${alt.bInterfaceProtocol.toString(16)}`);
            console.log(`    bNumEndpoints: ${alt.bNumEndpoints}`);
            if (alt.endpoints) {
              for (const ep of alt.endpoints) {
                const dir = (ep.bEndpointAddress & 0x80) ? 'IN' : 'OUT';
                const type = ep.bmAttributes & 0x03;
                const typeNames = ['Control', 'Isochronous', 'Bulk', 'Interrupt'];
                console.log(`    EP 0x${ep.bEndpointAddress.toString(16)}: ${dir}, ${typeNames[type]}, maxPacket=${ep.wMaxPacketSize}`);
              }
            }
          }
        }
      }
    }
  } else {
    console.log('  allConfigDescriptors is null/undefined');
  }
} catch (err) {
  console.log('  Error:', err.message);
}

// Try configDescriptor (single)
try {
  const cfg = procyon.configDescriptor;
  if (cfg) {
    console.log(`\nSingle configDescriptor: bConfigurationValue=${cfg.bConfigurationValue}, bNumInterfaces=${cfg.bNumInterfaces}`);
  }
} catch (err) {
  console.log('configDescriptor error:', err.message);
}

console.log('\n--- Try Open Device ---');
try {
  procyon.open();
  console.log('Device opened successfully!');
} catch (err) {
  console.log('FAILED to open:', err.message);
  process.exit(1);
}

// Try setAutoDetachKernelDriver
try {
  procyon.setAutoDetachKernelDriver(true);
  console.log('setAutoDetachKernelDriver(true): OK');
} catch (err) {
  console.log('setAutoDetachKernelDriver(true):', err.message);
}

// Try setConfiguration
try {
  const cfgDesc = procyon.configDescriptor || (procyon.allConfigDescriptors && procyon.allConfigDescriptors[0]);
  if (cfgDesc) {
    procyon.setConfiguration(cfgDesc.bConfigurationValue);
    console.log(`setConfiguration(${cfgDesc.bConfigurationValue}): OK`);
  }
} catch (err) {
  console.log('setConfiguration:', err.message);
}

// Config descriptors after open
console.log('\n--- Config Descriptors (after open) ---');
try {
  const configs = procyon.allConfigDescriptors;
  if (configs) {
    for (let c = 0; c < configs.length; c++) {
      const cfg = configs[c];
      console.log(`Config ${c}: bConfigurationValue=${cfg.bConfigurationValue}, bNumInterfaces=${cfg.bNumInterfaces}`);
    }
  }
} catch (err) {
  console.log('Error:', err.message);
}

// Try device.interface(n) for n = 0..7
console.log('\n--- Try device.interface(n) ---');
for (let n = 0; n < 8; n++) {
  try {
    const iface = procyon.interface(n);
    console.log(`  interface(${n}): FOUND`);
    console.log(`    id: ${iface.id}`);
    console.log(`    altSetting: ${iface.altSetting}`);
    console.log(`    interfaceClass: ${iface.interfaceClass}`);
    console.log(`    endpoints: ${iface.endpoints ? iface.endpoints.length : 0}`);
    if (iface.endpoints && iface.endpoints.length > 0) {
      for (const ep of iface.endpoints) {
        console.log(`      EP address=0x${(ep.address || 0).toString(16)} direction=${ep.direction} transferType=${ep.transferType}`);
      }
    }
    // Try claim
    try {
      iface.claim();
      console.log(`    claim(): SUCCESS`);
      try { iface.release(false, () => {}); } catch(e) {}
    } catch (claimErr) {
      console.log(`    claim(): FAILED - ${claimErr.message}`);
    }
  } catch (err) {
    console.log(`  interface(${n}): NOT FOUND - ${err.message}`);
  }
}

// Try device.interfaces property
console.log('\n--- device.interfaces property ---');
try {
  const ifaces = procyon.interfaces;
  if (ifaces) {
    console.log(`  Length: ${ifaces.length}`);
    for (let i = 0; i < ifaces.length; i++) {
      console.log(`  [${i}]:`, typeof ifaces[i], ifaces[i] ? Object.keys(ifaces[i]) : 'null');
    }
  } else {
    console.log('  interfaces is null/undefined');
  }
} catch (err) {
  console.log('  Error:', err.message);
}

// Check node-usb version and available methods
console.log('\n--- node-usb Info ---');
console.log(`  usb.VERSION: ${usb.VERSION || 'unknown'}`);
console.log(`  usb.usb: ${typeof usb.usb}`);
console.log('  procyon methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(procyon)).join(', '));

// Close
try { procyon.close(); } catch(e) {}
console.log('\n=== Diagnostic Complete ===');
