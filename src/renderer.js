import './index.css';
import { Wiimote } from './wiimote.js';

const connectBtn = document.getElementById('connect-btn');
const statusDiv = document.getElementById('status');
const autosyncToggle = document.getElementById('autosync-toggle');

let wiimote = null;
let autosyncEnabled = true; // Default to true for automatic pairing

// Load autosync preference
const storedAutosync = localStorage.getItem('wiimote-autosync');
if (storedAutosync !== null) {
  autosyncEnabled = storedAutosync === 'true';
}
autosyncToggle.checked = autosyncEnabled;

autosyncToggle.addEventListener('change', (e) => {
  autosyncEnabled = e.target.checked;
  localStorage.setItem('wiimote-autosync', autosyncEnabled);
  if (autosyncEnabled) {
    attemptAutoConnect();
  }
});

async function connectToDevice(device) {
  try {
    wiimote = new Wiimote(device);
    statusDiv.textContent = `Status: Connecting to ${device.productName}...`;
    
    await wiimote.init();
    
    statusDiv.textContent = `Status: Connected to ${device.productName}`;
    connectBtn.disabled = true;

    wiimote.onButtonUpdate = (buttons) => {
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
      connectBtn.disabled = false;
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
  }
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
