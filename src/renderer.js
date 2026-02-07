import './index.css';
import { Wiimote } from './wiimote.js';

const connectBtn = document.getElementById('connect-btn');
const statusDiv = document.getElementById('status');
const autosyncToggle = document.getElementById('autosync-toggle');
const pairingHelp = document.getElementById('pairing-help');
const syncBtn = document.getElementById('sync-btn');

const modeTitle = document.getElementById('current-mode-title');
const mediaHelp = document.getElementById('media-controls');
const navHelp = document.getElementById('nav-controls');

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
const SCROLL_COOLDOWN = 50;  // Fixed faster cooldown for scrolling
let currentCooldown = INITIAL_COOLDOWN;
let lastButtonPressed = null;
let bPressedTime = 0;
let bActionTriggered = false;
let aPressedTime = 0;
let aActionTriggered = false;
let prevButtons = {};

const MODES = {
  MEDIA: 'Media Playback',
  NAV: 'Browser/Navigation'
};
let currentMode = MODES.MEDIA;

async function connectToDevice(device) {
  try {
    wiimote = new Wiimote(device);
    statusDiv.textContent = `Status: Connecting to ${device.productName}...`;
    
    await wiimote.init();
    
    statusDiv.textContent = `Status: Connected to ${device.productName}`;

    wiimote.onButtonUpdate = (buttons) => {
      const now = Date.now();

      // Detection of button transitions
      if (buttons.B && !prevButtons.B) {
        bPressedTime = now;
        bActionTriggered = false;
        console.log('B pressed - tracking for chord');
      }
      if (buttons.A && !prevButtons.A) {
        aPressedTime = now;
        aActionTriggered = false;
        console.log('A pressed - tracking for chord');
      }

      // Handle release actions for A and B
      if (!buttons.B && prevButtons.B) {
        if (currentMode === MODES.NAV && !bActionTriggered && bPressedTime !== 0 && (now - bPressedTime < 1000)) {
          console.log('B released (no chord) - triggering refresh');
          systemApi.navControl('refresh');
        }
        bPressedTime = 0;
      }
      if (!buttons.A && prevButtons.A) {
        if (currentMode === MODES.NAV && !aActionTriggered && aPressedTime !== 0 && (now - aPressedTime < 1000)) {
          console.log('A released (no chord) - triggering click');
          systemApi.navControl('click');
        }
        aPressedTime = 0;
      }
      
      // Mode Switching (- or +)
      if ((buttons.MINUS || buttons.PLUS) && lastButtonPressed !== 'MODE') {
        currentMode = currentMode === MODES.MEDIA ? MODES.NAV : MODES.MEDIA;
        lastButtonPressed = 'MODE';
        
        // Update UI
        if (modeTitle) modeTitle.textContent = `Mode: ${currentMode}`;
        if (mediaHelp) mediaHelp.style.display = currentMode === MODES.MEDIA ? 'block' : 'none';
        if (navHelp) navHelp.style.display = currentMode === MODES.NAV ? 'block' : 'none';
        
        statusDiv.textContent = `Mode: ${currentMode}`;
        console.log(`Switched to mode: ${currentMode}`);
        return;
      }
      if (!buttons.MINUS && !buttons.PLUS && lastButtonPressed === 'MODE') {
        lastButtonPressed = null;
      }

      // Navigation Mode chording detection
      if (currentMode === MODES.NAV) {
        if (buttons.B && (buttons.LEFT || buttons.RIGHT || buttons.UP || buttons.DOWN || buttons.A)) {
          bActionTriggered = true;
        }
        if (buttons.A && (buttons.UP || buttons.DOWN || buttons.B)) {
          aActionTriggered = true;
        }
      }

      // Determine logical pressed button
      let pressedButton = null;

      if (currentMode === MODES.NAV) {
        // In Nav mode, check physical buttons to determine logical action
        if (buttons.UP) {
          if (buttons.A) pressedButton = 'PAGE-UP';
          else if (buttons.B) pressedButton = 'ZOOM-IN';
          else pressedButton = 'UP';
        }
        else if (buttons.DOWN) {
          if (buttons.A) pressedButton = 'PAGE-DOWN';
          else if (buttons.B) pressedButton = 'ZOOM-OUT';
          else pressedButton = 'DOWN';
        }
        else if (buttons.LEFT) {
          // If we were already holding a button, don't change its meaning
          if (lastButtonPressed === 'LEFT' || lastButtonPressed === 'SHIFT-TAB') {
            pressedButton = lastButtonPressed;
          } else {
            pressedButton = buttons.B ? 'LEFT' : 'SHIFT-TAB';
          }
        }
        else if (buttons.RIGHT) {
          if (lastButtonPressed === 'RIGHT' || lastButtonPressed === 'TAB') {
            pressedButton = lastButtonPressed;
          } else {
            pressedButton = buttons.B ? 'RIGHT' : 'TAB';
          }
        }
        else if (buttons.A) {
          if (buttons.B) {
            pressedButton = 'ENTER';
          } else {
            pressedButton = 'A';
          }
        }
        else if (buttons.B) {
          pressedButton = 'B';
        }
        else if (buttons.ONE) pressedButton = 'ZOOM-RESET';
        else if (buttons.TWO) pressedButton = 'ESCAPE';
      } else {
        // Media Mode (Standard mapping)
        pressedButton = buttons.UP ? 'UP' : 
                         (buttons.DOWN ? 'DOWN' : 
                         (buttons.LEFT ? 'LEFT' : 
                         (buttons.RIGHT ? 'RIGHT' : 
                         (buttons.A ? 'A' : 
                         (buttons.B ? 'B' : null)))));
      }

      if (pressedButton) {
        if (pressedButton !== lastButtonPressed) {
          // Reset cooldown on new button press
          currentCooldown = (pressedButton === 'UP' || pressedButton === 'DOWN') && currentMode === MODES.NAV 
            ? SCROLL_COOLDOWN 
            : INITIAL_COOLDOWN;
            
          lastButtonPressed = pressedButton;
          
          // Execute immediately on first press
          if (currentMode === MODES.MEDIA) {
            if (pressedButton === 'UP') systemApi.changeVolume('up');
            else if (pressedButton === 'DOWN') systemApi.changeVolume('down');
            else if (pressedButton === 'LEFT') systemApi.mediaControl('previous');
            else if (pressedButton === 'RIGHT') systemApi.mediaControl('next');
            else if (pressedButton === 'A') systemApi.mediaControl('play-pause');
          } else {
            // Navigation Mode
            if (pressedButton === 'UP') systemApi.navControl('scroll-up');
            else if (pressedButton === 'DOWN') systemApi.navControl('scroll-down');
            else if (pressedButton === 'LEFT') systemApi.navControl('back');
            else if (pressedButton === 'RIGHT') systemApi.navControl('forward');
            else if (pressedButton === 'TAB') {
              console.log('Sending TAB');
              systemApi.navControl('tab');
            }
            else if (pressedButton === 'SHIFT-TAB') {
              console.log('Sending SHIFT-TAB');
              systemApi.navControl('shift-tab');
            }
            else if (pressedButton === 'A') {
              // Don't trigger A (Click) immediately, wait for release
              console.log('A button held (modifier candidate)');
            }
            else if (pressedButton === 'ENTER') systemApi.navControl('enter');
            else if (pressedButton === 'ESCAPE') systemApi.navControl('escape');
            else if (pressedButton === 'PAGE-UP') systemApi.navControl('page-up');
            else if (pressedButton === 'PAGE-DOWN') systemApi.navControl('page-down');
            else if (pressedButton === 'ZOOM-IN') systemApi.navControl('zoom-in');
            else if (pressedButton === 'ZOOM-OUT') systemApi.navControl('zoom-out');
            else if (pressedButton === 'ZOOM-RESET') systemApi.navControl('zoom-reset');
            else if (pressedButton === 'B') {
              // Don't trigger B (Refresh) immediately, wait for release
              console.log('B button held (modifier candidate)');
            }
          }
          
          lastVolumeChange = now;
        } else if (now - lastVolumeChange > currentCooldown) {
          // Accelerate if holding
          if (currentMode === MODES.MEDIA) {
            if (pressedButton === 'UP') systemApi.changeVolume('up');
            else if (pressedButton === 'DOWN') systemApi.changeVolume('down');
            else if (pressedButton === 'LEFT') systemApi.mediaControl('previous');
            else if (pressedButton === 'RIGHT') systemApi.mediaControl('next');
          } else {
            // Navigation Mode repeats
            if (pressedButton === 'UP') systemApi.navControl('scroll-up');
            else if (pressedButton === 'DOWN') systemApi.navControl('scroll-down');
            else if (pressedButton === 'TAB') {
              console.log('Sending TAB (repeat)');
              systemApi.navControl('tab');
            }
            else if (pressedButton === 'SHIFT-TAB') {
              console.log('Sending SHIFT-TAB (repeat)');
              systemApi.navControl('shift-tab');
            }
            else if (pressedButton === 'PAGE-UP') systemApi.navControl('page-up');
            else if (pressedButton === 'PAGE-DOWN') systemApi.navControl('page-down');
            else if (pressedButton === 'ZOOM-IN') systemApi.navControl('zoom-in');
            else if (pressedButton === 'ZOOM-OUT') systemApi.navControl('zoom-out');
          }

          // Reduce cooldown for next repeat (only for certain buttons)
          const accelButtons = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'TAB', 'SHIFT-TAB', 'PAGE-UP', 'PAGE-DOWN', 'ZOOM-IN', 'ZOOM-OUT'];
          if (accelButtons.includes(pressedButton)) {
            if (currentMode === MODES.NAV && (pressedButton === 'UP' || pressedButton === 'DOWN')) {
              currentCooldown = SCROLL_COOLDOWN; // Keep scroll constant and fast
            } else {
              currentCooldown = Math.max(MIN_COOLDOWN, currentCooldown * 0.8);
            }
            lastVolumeChange = now;
          }
        }
      } else if (lastButtonPressed !== 'MODE') {
        lastButtonPressed = null;
        currentCooldown = INITIAL_COOLDOWN;
      }

      // Update button state history
      prevButtons = { ...buttons };

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
