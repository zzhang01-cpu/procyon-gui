// Quick test: connect to Procyon CM via interface(1) + skip claim
const usb = require('usb');
const VID = 0x2269, PID = 0xBEEF;

async function testConnect() {
  console.log('=== Procyon Connection Test ===\n');

  const device = usb.findByIds(VID, PID);
  if (!device) { console.log('Procyon NOT found!'); process.exit(1); }
  console.log('1. Found Procyon device');

  // Open
  try { device.open(); console.log('2. Opened device'); }
  catch(e) { console.log('2. FAILED to open:', e.message); process.exit(1); }

  // Auto-detach
  try { device.setAutoDetachKernelDriver(true); console.log('3. Auto-detach OK'); }
  catch(e) { console.log('3. Auto-detach:', e.message); }

  // Set config
  try {
    const cfg = device.configDescriptor;
    if (cfg) { device.setConfiguration(cfg.bConfigurationValue); console.log('4. Set config OK'); }
  } catch(e) { console.log('4. Set config:', e.message); }

  // Get interface(1) - this works on Windows+WinUSB!
  let iface;
  try { iface = device.interface(1); console.log('5. Got interface(1), endpoints:', iface.endpoints.length); }
  catch(e) { console.log('5. interface(1) FAILED:', e.message); try{device.close();}catch(e2){} process.exit(1); }

  // Try claim (will likely fail on WinUSB, that's OK)
  let claimed = false;
  try { iface.claim(); claimed = true; console.log('6. Claimed interface'); }
  catch(e) { console.log('6. Claim failed (expected):', e.message); }

  // Get endpoints
  let epOut = null, epIn = null;
  for (const ep of iface.endpoints) {
    console.log('   EP:', '0x' + (ep.address||0).toString(16), ep.direction);
    if (ep.direction === 'out') epOut = ep;
    if (ep.direction === 'in') epIn = ep;
  }

  if (!epOut || !epIn) {
    console.log('7. Endpoints NOT found! OUT:', !!epOut, 'IN:', !!epIn);
    try{device.close();}catch(e){}
    process.exit(1);
  }
  console.log('7. Got both endpoints! OUT=0x01, IN=0x81');

  // Try start polling
  try {
    epIn.startPoll(3, 64);
    console.log('8. Started polling IN endpoint');
  } catch(e) {
    console.log('8. FAILED to start polling:', e.message);
    try{device.close();}catch(e2){}
    process.exit(1);
  }

  // Send GET_FIRMWARE_VERSION command
  console.log('\n9. Sending GET_FIRMWARE_VERSION command...');
  const cmd = Buffer.alloc(64, 0);
  cmd[0] = 0x01; // GET_FIRMWARE_VERSION

  try {
    await new Promise((resolve, reject) => {
      epOut.transfer(cmd, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('   Command sent successfully!');
  } catch(e) {
    console.log('   Send FAILED:', e.message);
  }

  // Wait for response
  console.log('10. Waiting for response (3 seconds)...');
  const responsePromise = new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 3000);
    epIn.once('data', (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });

  const response = await responsePromise;
  if (response) {
    console.log('   Got response!', response.length, 'bytes');
    console.log('   Header: 0x' + response[0].toString(16));
    if (response[0] === 0xA5) {
      console.log('   *** VALID RESPONSE HEADER (0xA5) ***');
      // Parse firmware version from response
      const fwMajor = response[1];
      const fwMinor = response[2];
      const fwPatch = response[3];
      console.log('   Firmware version:', fwMajor + '.' + fwMinor + '.' + fwPatch);
    } else {
      console.log('   First 16 bytes:', Buffer.from(response).slice(0, 16).toString('hex'));
    }
  } else {
    console.log('   No response (timeout)');
  }

  // Cleanup
  try { epIn.stopPoll(); } catch(e) {}
  try { if (claimed) iface.release(false, () => {}); } catch(e) {}
  try { device.close(); } catch(e) {}

  console.log('\n=== Test Complete ===');
  process.exit(0);
}

testConnect().catch(e => { console.error('Error:', e); process.exit(1); });
