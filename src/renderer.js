import './index.css';
import { Wiimote } from './wiimote.js';

const connectBtn = document.getElementById('connect-btn');
const statusDiv = document.getElementById('status');
const autosyncToggle = document.getElementById('autosync-toggle');
const pairingHelp = document.getElementById('pairing-help');
const syncBtn = document.getElementById('sync-btn');

let wiimote = null;
let autosyncEnabled = true; // Default to true for automatic pairing
const systemApi = typeof window !== 'undefined' ? window.system : null;
let syncInProgress = false;
const guestToggle = document.getElementById('guest-toggle');

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

if (systemApi?.syncWiimote) {
  console.log('Native sync helper available');
} else {
  console.warn('Native sync helper not available');
}

// Load autosync preference
const storedAutosync = localStorage.getItem('wiimote-autosync');
if (storedAutosync !== null) {
  autosyncEnabled = storedAutosync === 'true';
}
autosyncToggle.checked = autosyncEnabled;

let guestMode = true;
const storedGuest = localStorage.getItem('wiimote-guest-mode');
if (storedGuest !== null) {
  guestMode = storedGuest === 'true';
}
if (guestToggle) {
  guestToggle.checked = guestMode;
  guestToggle.addEventListener('change', (e) => {
    guestMode = e.target.checked;
    localStorage.setItem('wiimote-guest-mode', guestMode);
  });
}

autosyncToggle.addEventListener('change', (e) => {
  autosyncEnabled = e.target.checked;
  localStorage.setItem('wiimote-autosync', autosyncEnabled);
  if (autosyncEnabled) {
    attemptAutoConnect();
  }
});


if (syncBtn) {
  syncBtn.addEventListener('click', async () => {
    try {
      const result = await runSync('manual');
      if (result?.ok) {
        statusDiv.textContent = 'Status: Sync complete. Click Connect Wii Remote.';
        await sleep(800);
        await connectAfterSync();
      } else if (!result?.skipped) {
        const devices = await navigator.hid.getDevices();
        const alreadyConnected = devices.some(d => d.vendorId === 0x057e);
        if (!alreadyConnected) {
          statusDiv.textContent = `Status: Sync failed${result?.error ? ` - ${result.error}` : ''}`;
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
      statusDiv.textContent = `Status: Error - ${error.message}`;
    }
  });
}

let lastVolumeChange = 0;
const INITIAL_COOLDOWN = 250; // Initial delay
const MIN_COOLDOWN = 50;     // Fastest repeat delay
let currentCooldown = INITIAL_COOLDOWN;
let lastButtonPressed = null;

async function connectToDevice(device) {
  try {
    wiimote = new Wiimote(device);
    statusDiv.textContent = `Status: Connecting to ${device.productName}...`;
    
    await wiimote.init();
    
    statusDiv.textContent = `Status: Connected to ${device.productName}`;

    wiimote.onButtonUpdate = (buttons) => {
      // Handle D-Pad inputs (with acceleration when holding)
      const now = Date.now();
      const pressedButton = buttons.UP ? 'UP' : (buttons.DOWN ? 'DOWN' : (buttons.LEFT ? 'LEFT' : (buttons.RIGHT ? 'RIGHT' : (buttons.A ? 'A' : null))));

      if (pressedButton) {
        if (pressedButton !== lastButtonPressed) {
          // Reset cooldown on new button press
          currentCooldown = INITIAL_COOLDOWN;
          lastButtonPressed = pressedButton;
          
          // Execute immediately on first press
          if (pressedButton === 'UP') systemApi.changeVolume('up');
          else if (pressedButton === 'DOWN') systemApi.changeVolume('down');
          else if (pressedButton === 'LEFT') systemApi.mediaControl('previous');
          else if (pressedButton === 'RIGHT') systemApi.mediaControl('next');
          else if (pressedButton === 'A') systemApi.mediaControl('play-pause');
          
          lastVolumeChange = now;
        } else if (now - lastVolumeChange > currentCooldown) {
          // Accelerate if holding (only for Up/Down/Left/Right, not A)
          if (pressedButton === 'UP') systemApi.changeVolume('up');
          else if (pressedButton === 'DOWN') systemApi.changeVolume('down');
          else if (pressedButton === 'LEFT') systemApi.mediaControl('previous');
          else if (pressedButton === 'RIGHT') systemApi.mediaControl('next');

          if (pressedButton !== 'A') {
            // Reduce cooldown for next repeat (minimum 50ms)
            currentCooldown = Math.max(MIN_COOLDOWN, currentCooldown * 0.8);
            lastVolumeChange = now;
          }
        }
      } else {
        lastButtonPressed = null;
        currentCooldown = INITIAL_COOLDOWN;
      }

      for (const [btn, pressed] of Object.entries(buttons)) {
        const el = document.getElementById(`btn-${btn}`);
        if (el) {
          el.textContent = `${btn}: ${pressed}`;
          el.style.fontWeight = pressed ? 'bold' : 'normal';
          el.style.color = pressed ? 'red' : 'black';
        }
      }
    };

    device.addEventListener('forget', () => {
      wiimote = null;
      statusDiv.textContent = 'Status: Disconnected (Device forgotten)';
    });

  } catch (error) {
    console.error('Connection failed:', error);
    statusDiv.textContent = `Status: Error - ${error.message}`;
  }
}

async function attemptAutoConnect() {
  if (!autosyncEnabled || wiimote) return;

  const devices = await navigator.hid.getDevices();
  const wiiRemote = devices.find(d => d.vendorId === 0x057e);
  
  if (wiiRemote) {
    await connectToDevice(wiiRemote);
    return;
  }
  const result = await runSync('auto');
  if (result?.ok) {
    await connectAfterSync();
  } else if (!result?.skipped && pairingHelp) {
    pairingHelp.textContent = 'Pairing: use 1+2 for guest or Sync for bonding, then click Sync.';
  }
}

async function connectAfterSync() {
  for (let i = 0; i < 6; i += 1) {
    await sleep(700);
    const refreshed = await navigator.hid.getDevices();
    const refreshedWii = refreshed.find(d => d.vendorId === 0x057e);
    if (refreshedWii) {
      await connectToDevice(refreshedWii);
      return;
    }
  }
}

async function runSync(mode) {
  if (!systemApi?.syncWiimote) {
    return { ok: false, error: 'Sync helper not available' };
  }
  if (syncInProgress) {
    console.log('Sync skipped: already in progress');
    return { ok: false, skipped: true };
  }
  syncInProgress = true;
  console.log('Invoking native sync helper', { mode, pairing: guestToggle ? (guestToggle.checked ? 'guest' : 'bond') : (guestMode ? 'guest' : 'bond') });
  statusDiv.textContent = mode === 'auto'
    ? 'Status: Auto-syncing Wii Remote...'
    : 'Status: Syncing Wii Remote...';
  const useGuest = guestToggle ? guestToggle.checked : guestMode;
  const result = await systemApi.syncWiimote(useGuest ? 'guest' : 'bond');
  syncInProgress = false;
  console.log(`Sync result: ${result?.ok ? 'ok' : 'failed'}${result?.error ? ` (${result.error})` : ''}`);
  if (result?.stdout) {
    console.log('Sync stdout:\n' + result.stdout.trim());
  }
  if (result?.stderr) {
    console.warn('Sync stderr:\n' + result.stderr.trim());
  }
  return result;
}

connectBtn.addEventListener('click', async () => {
  try {
    statusDiv.textContent = 'Status: Searching...';
    
    // Request Wii Remote device
    // Nintendo Vendor ID: 0x057e
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: 0x057e }]
    });

    if (devices.length > 0) {
      await connectToDevice(devices[0]);
    } else {
      statusDiv.textContent = 'Status: No Wii Remote selected';
    }
  } catch (error) {
    console.error('Connection failed:', error);
    statusDiv.textContent = `Status: Error - ${error.message}`;
  }
});

// Check for already connected devices on startup
async function startupCheck() {
  const devices = await navigator.hid.getDevices();
  const wiiRemote = devices.find(d => d.vendorId === 0x057e);
  if (wiiRemote && autosyncEnabled) {
    console.log('Auto-connecting to existing device on startup');
    connectToDevice(wiiRemote);
  }
}

startupCheck();

// Listen for device connections
navigator.hid.addEventListener('connect', (event) => {
  if (autosyncEnabled && event.device.vendorId === 0x057e && !wiimote) {
    connectToDevice(event.device);
  }
});

console.log('Renderer process initialized');
