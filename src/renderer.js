import './index.css';
import { Wiimote } from './wiimote.js';
import 'simple-keyboard/build/css/index.css';

const connectBtn = document.getElementById('connect-btn');
const statusDiv = document.getElementById('status');
const autosyncToggle = document.getElementById('autosync-toggle');
const pairingHelp = document.getElementById('pairing-help');
const syncBtn = document.getElementById('sync-btn');

const modeTitle = document.getElementById('current-mode-title');
const mediaHelp = document.getElementById('media-controls');
const navHelp = document.getElementById('nav-controls');
const wiimoteDisplay = document.getElementById('wiimote-display');
let wiimoteSvgInitialized = false;

let wiimote = null;
let wiimoteConnected = false;
let autosyncEnabled = true; // Default to true for automatic pairing
const systemApi = typeof window !== 'undefined' ? window.system : null;
let syncInProgress = false;
let ledFlashInterval = null;
let ledFlashOn = false;
const guestToggle = document.getElementById('guest-toggle');
const xinputToggle = document.getElementById('xinput-toggle');
const xinputMappingContainer = document.getElementById('xinput-mapping');
const xinputCalibrationContainer = document.getElementById('xinput-calibration');
let prevNunchukButtons = { z: false, c: false };
let lastWiimoteLogAt = 0;
let lastNunchukLogAt = 0;
let nunchukActive = false;
let lastNunchukInputLogAt = 0;
let lastMouseMoveSentAt = 0;
let pendingMouseMove = { dx: 0, dy: 0 };
let mouseMoveTimer = null;
let nunchukStickVisual = { el: null, cx0: 0, cy0: 0, x: 0, y: 0 };
let xinputEnabled = false;
let xinputMapping = null;
let xinputCalibration = null;
let lastNunchukState = { stickX: 0, stickY: 0, cPressed: false, zPressed: false };

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const flushMouseMove = () => {
  mouseMoveTimer = null;
  const dx = Math.trunc(pendingMouseMove.dx);
  const dy = Math.trunc(pendingMouseMove.dy);
  if (dx === 0 && dy === 0) return;
  pendingMouseMove.dx -= dx;
  pendingMouseMove.dy -= dy;
  lastMouseMoveSentAt = Date.now();
  systemApi.navControl({ action: 'mouse-move', dx, dy });
};

const queueMouseMove = (dx, dy) => {
  if (dx === 0 && dy === 0) return;
  pendingMouseMove.dx += dx;
  pendingMouseMove.dy += dy;
  const now = Date.now();
  if (now - lastMouseMoveSentAt >= 4) {
    flushMouseMove();
    return;
  }
  if (!mouseMoveTimer) {
    mouseMoveTimer = setTimeout(flushMouseMove, 4);
  }
};

const resetMouseMove = () => {
  pendingMouseMove = { dx: 0, dy: 0 };
  if (mouseMoveTimer) {
    clearTimeout(mouseMoveTimer);
    mouseMoveTimer = null;
  }
};

const XINPUT_ENABLED_KEY = 'xinput-enabled';
const XINPUT_MAPPING_KEY = 'xinput-mapping';
const XINPUT_CALIBRATION_KEY = 'xinput-calibration';
const DEFAULT_XINPUT_CALIBRATION = {
  scaleX: 1,
  scaleY: 1,
  deadzone: 0.08
};
const DEFAULT_XINPUT_MAPPING = {
  wiimote: {
    dpad: {
      up: 'Y',
      right: 'B',
      down: 'A',
      left: 'X'
    },
    plus: 'START',
    minus: 'BACK',
    a: 'RT',
    b: 'RB'
  },
  nunchuk: {
    c: 'LT',
    z: 'LB'
  }
};

const XINPUT_TARGET_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'X', label: 'X' },
  { value: 'Y', label: 'Y' },
  { value: 'LB', label: 'LB' },
  { value: 'RB', label: 'RB' },
  { value: 'LT', label: 'LT' },
  { value: 'RT', label: 'RT' },
  { value: 'START', label: 'Start' },
  { value: 'BACK', label: 'Back' },
  { value: 'LS', label: 'Left Stick Click' },
  { value: 'RS', label: 'Right Stick Click' },
  { value: 'GUIDE', label: 'Guide' },
  { value: 'DPAD_UP', label: 'D-Pad Up' },
  { value: 'DPAD_DOWN', label: 'D-Pad Down' },
  { value: 'DPAD_LEFT', label: 'D-Pad Left' },
  { value: 'DPAD_RIGHT', label: 'D-Pad Right' }
];

const XINPUT_MAPPING_ITEMS = [
  { id: 'xinput-map-dpad-up', path: 'wiimote.dpad.up', label: 'Wiimote D-Pad Up' },
  { id: 'xinput-map-dpad-right', path: 'wiimote.dpad.right', label: 'Wiimote D-Pad Right' },
  { id: 'xinput-map-dpad-down', path: 'wiimote.dpad.down', label: 'Wiimote D-Pad Down' },
  { id: 'xinput-map-dpad-left', path: 'wiimote.dpad.left', label: 'Wiimote D-Pad Left' },
  { id: 'xinput-map-plus', path: 'wiimote.plus', label: 'Wiimote +' },
  { id: 'xinput-map-minus', path: 'wiimote.minus', label: 'Wiimote -' },
  { id: 'xinput-map-a', path: 'wiimote.a', label: 'Wiimote A' },
  { id: 'xinput-map-b', path: 'wiimote.b', label: 'Wiimote B' },
  { id: 'xinput-map-c', path: 'nunchuk.c', label: 'Nunchuk C' },
  { id: 'xinput-map-z', path: 'nunchuk.z', label: 'Nunchuk Z' }
];

const cloneValue = (value) => JSON.parse(JSON.stringify(value));

const mergeMapping = (base, override) => {
  if (!override || typeof override !== 'object') return base;
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeMapping(result[key] ?? {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

const getMappingValue = (mapping, path) => path.split('.').reduce((acc, key) => acc?.[key], mapping);

const setMappingValue = (mapping, path, value) => {
  const parts = path.split('.');
  let target = mapping;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!target[part] || typeof target[part] !== 'object') {
      target[part] = {};
    }
    target = target[part];
  }
  target[parts[parts.length - 1]] = value;
};

const loadXinputMapping = () => {
  let mapping = cloneValue(DEFAULT_XINPUT_MAPPING);
  const stored = localStorage.getItem(XINPUT_MAPPING_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      mapping = mergeMapping(mapping, parsed);
    } catch {
      localStorage.removeItem(XINPUT_MAPPING_KEY);
    }
  }
  return mapping;
};

const buildXinputMappingUI = () => {
  if (!xinputMappingContainer) return;
  xinputMappingContainer.innerHTML = '';
  XINPUT_MAPPING_ITEMS.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'xinput-mapping-row';
    const label = document.createElement('label');
    label.htmlFor = item.id;
    label.textContent = item.label;
    const select = document.createElement('select');
    select.id = item.id;
    XINPUT_TARGET_OPTIONS.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    });
    const currentValue = getMappingValue(xinputMapping, item.path) ?? 'NONE';
    select.value = currentValue;
    select.addEventListener('change', (event) => {
      setMappingValue(xinputMapping, item.path, event.target.value);
      localStorage.setItem(XINPUT_MAPPING_KEY, JSON.stringify(xinputMapping));
    });
    row.appendChild(label);
    row.appendChild(select);
    xinputMappingContainer.appendChild(row);
  });
};

const clampCalibrationValue = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const loadXinputCalibration = () => {
  let calibration = { ...DEFAULT_XINPUT_CALIBRATION };
  const stored = localStorage.getItem(XINPUT_CALIBRATION_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      calibration = {
        scaleX: clampCalibrationValue(parsed.scaleX, 0.5, 1.8, DEFAULT_XINPUT_CALIBRATION.scaleX),
        scaleY: clampCalibrationValue(parsed.scaleY, 0.5, 1.8, DEFAULT_XINPUT_CALIBRATION.scaleY),
        deadzone: clampCalibrationValue(parsed.deadzone, 0, 0.4, DEFAULT_XINPUT_CALIBRATION.deadzone)
      };
    } catch {
      localStorage.removeItem(XINPUT_CALIBRATION_KEY);
    }
  }
  return calibration;
};

const saveXinputCalibration = () => {
  localStorage.setItem(XINPUT_CALIBRATION_KEY, JSON.stringify(xinputCalibration));
};

const formatAxisValue = (value) => Number(value ?? 0).toFixed(2);

const updateXinputCalibrationDisplay = () => {
  const rawX = document.getElementById('xinput-calibration-raw-x');
  const rawY = document.getElementById('xinput-calibration-raw-y');
  const outX = document.getElementById('xinput-calibration-out-x');
  const outY = document.getElementById('xinput-calibration-out-y');
  if (!rawX || !rawY || !outX || !outY) return;

  const deadzone = xinputCalibration?.deadzone ?? DEFAULT_XINPUT_CALIBRATION.deadzone;
  const scaleX = xinputCalibration?.scaleX ?? DEFAULT_XINPUT_CALIBRATION.scaleX;
  const scaleY = xinputCalibration?.scaleY ?? DEFAULT_XINPUT_CALIBRATION.scaleY;
  const inputX = lastNunchukState?.stickX ?? 0;
  const inputY = lastNunchukState?.stickY ?? 0;
  const outputX = normalizeStickAxis(inputX, deadzone, scaleX);
  const outputY = normalizeStickAxis(inputY, deadzone, scaleY);

  rawX.textContent = formatAxisValue(inputX);
  rawY.textContent = formatAxisValue(inputY);
  outX.textContent = formatAxisValue(outputX);
  outY.textContent = formatAxisValue(outputY);
};

const buildXinputCalibrationUI = () => {
  if (!xinputCalibrationContainer) return;
  xinputCalibrationContainer.innerHTML = '';

  const buildRow = (labelText, value, min, max, step, onChange) => {
    const row = document.createElement('div');
    row.className = 'xinput-calibration-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('change', (event) => {
      const nextValue = clampCalibrationValue(event.target.value, min, max, value);
      event.target.value = String(nextValue);
      onChange(nextValue);
    });
    row.appendChild(label);
    row.appendChild(input);
    xinputCalibrationContainer.appendChild(row);
  };

  buildRow('Left Stick X Scale', xinputCalibration.scaleX, 0.5, 1.8, 0.01, (value) => {
    xinputCalibration.scaleX = value;
    saveXinputCalibration();
    updateXinputCalibrationDisplay();
  });

  buildRow('Left Stick Y Scale', xinputCalibration.scaleY, 0.5, 1.8, 0.01, (value) => {
    xinputCalibration.scaleY = value;
    saveXinputCalibration();
    updateXinputCalibrationDisplay();
  });

  buildRow('Left Stick Deadzone', xinputCalibration.deadzone, 0, 0.4, 0.01, (value) => {
    xinputCalibration.deadzone = value;
    saveXinputCalibration();
    updateXinputCalibrationDisplay();
  });

  const display = document.createElement('div');
  display.className = 'xinput-calibration-display';
  const displayRows = [
    {
      label: 'Stick X',
      values: [
        { text: 'Raw', id: 'xinput-calibration-raw-x' },
        { text: 'Out', id: 'xinput-calibration-out-x' }
      ]
    },
    {
      label: 'Stick Y',
      values: [
        { text: 'Raw', id: 'xinput-calibration-raw-y' },
        { text: 'Out', id: 'xinput-calibration-out-y' }
      ]
    }
  ];
  displayRows.forEach((row) => {
    const line = document.createElement('div');
    line.className = 'xinput-calibration-display-row';
    const label = document.createElement('span');
    label.textContent = row.label;
    line.appendChild(label);
    const valueGroup = document.createElement('div');
    valueGroup.className = 'xinput-calibration-display-values';
    row.values.forEach((valueDef) => {
      const value = document.createElement('span');
      value.id = valueDef.id;
      value.textContent = '0.00';
      const labelValue = document.createElement('span');
      labelValue.textContent = `${valueDef.text}:`;
      const pair = document.createElement('span');
      pair.className = 'xinput-calibration-display-pair';
      pair.appendChild(labelValue);
      pair.appendChild(value);
      valueGroup.appendChild(pair);
    });
    line.appendChild(valueGroup);
    display.appendChild(line);
  });
  xinputCalibrationContainer.appendChild(display);

  updateXinputCalibrationDisplay();
};

const applyXinputTarget = (state, target) => {
  switch (target) {
    case 'A':
    case 'B':
    case 'X':
    case 'Y':
    case 'START':
    case 'BACK':
    case 'GUIDE':
      state.buttons[target] = true;
      break;
    case 'LB':
      state.buttons.LB = true;
      break;
    case 'RB':
      state.buttons.RB = true;
      break;
    case 'LS':
      state.buttons.LS = true;
      break;
    case 'RS':
      state.buttons.RS = true;
      break;
    case 'LT':
      state.triggers.left = 1;
      break;
    case 'RT':
      state.triggers.right = 1;
      break;
    case 'DPAD_UP':
      state.axes.dpadY = 1;
      break;
    case 'DPAD_DOWN':
      state.axes.dpadY = -1;
      break;
    case 'DPAD_LEFT':
      state.axes.dpadX = -1;
      break;
    case 'DPAD_RIGHT':
      state.axes.dpadX = 1;
      break;
    default:
      break;
  }
};

const normalizeStickAxis = (value, deadzone, scale) => {
  const scaled = Math.max(-1, Math.min(1, value * scale));
  if (Math.abs(scaled) <= deadzone) return 0;
  const sign = Math.sign(scaled);
  const magnitude = Math.abs(scaled);
  const normalized = (magnitude - deadzone) / (1 - deadzone);
  return sign * Math.min(1, normalized);
};

const buildXinputState = (buttons) => {
  const mapping = xinputMapping ?? DEFAULT_XINPUT_MAPPING;
  const state = {
    buttons: {},
    axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0, dpadX: 0, dpadY: 0 },
    triggers: { left: 0, right: 0 }
  };

  if (buttons?.UP) applyXinputTarget(state, mapping.wiimote.dpad.up);
  if (buttons?.RIGHT) applyXinputTarget(state, mapping.wiimote.dpad.right);
  if (buttons?.DOWN) applyXinputTarget(state, mapping.wiimote.dpad.down);
  if (buttons?.LEFT) applyXinputTarget(state, mapping.wiimote.dpad.left);
  if (buttons?.PLUS) applyXinputTarget(state, mapping.wiimote.plus);
  if (buttons?.MINUS) applyXinputTarget(state, mapping.wiimote.minus);
  if (buttons?.A) applyXinputTarget(state, mapping.wiimote.a);
  if (buttons?.B) applyXinputTarget(state, mapping.wiimote.b);
  if (lastNunchukState.cPressed) applyXinputTarget(state, mapping.nunchuk.c);
  if (lastNunchukState.zPressed) applyXinputTarget(state, mapping.nunchuk.z);

  const deadzone = xinputCalibration?.deadzone ?? DEFAULT_XINPUT_CALIBRATION.deadzone;
  const scaleX = xinputCalibration?.scaleX ?? DEFAULT_XINPUT_CALIBRATION.scaleX;
  const scaleY = xinputCalibration?.scaleY ?? DEFAULT_XINPUT_CALIBRATION.scaleY;
  state.axes.leftX = normalizeStickAxis(lastNunchukState.stickX, deadzone, scaleX);
  state.axes.leftY = normalizeStickAxis(lastNunchukState.stickY, deadzone, scaleY);
  return state;
};

const sendXinputState = (buttons) => {
  if (!xinputEnabled || !systemApi?.xinputUpdate) return;
  const state = buildXinputState(buttons);
  systemApi.xinputUpdate(state);
};

const applyCurrentLedState = () => {
  if (!wiimote) return;
  if (xinputEnabled) {
    wiimote.setLEDs(true, false, false, true);
    return;
  }
  switch (currentMode) {
    case MODES.MEDIA:
      wiimote.setLEDs(true, false, false, false);
      break;
    case MODES.NAV:
      wiimote.setLEDs(false, true, false, false);
      break;
    case MODES.PRES:
      wiimote.setLEDs(false, false, true, false);
      break;
    case MODES.KBD:
      wiimote.setLEDs(false, false, false, true);
      break;
    default:
      break;
  }
};

const setXinputEnabled = async (enabled) => {
  const desired = Boolean(enabled);
  xinputEnabled = desired;
  localStorage.setItem(XINPUT_ENABLED_KEY, xinputEnabled);
  if (xinputToggle) {
    xinputToggle.checked = xinputEnabled;
  }
  updateWiimoteLedDisplay();
  applyCurrentLedState();
  if (systemApi?.xinputToggle) {
    const result = await systemApi.xinputToggle(xinputEnabled);
    if (!result?.ok) {
      xinputEnabled = false;
      localStorage.setItem(XINPUT_ENABLED_KEY, xinputEnabled);
      if (xinputToggle) {
        xinputToggle.checked = false;
      }
      updateWiimoteLedDisplay();
      applyCurrentLedState();
      statusDiv.textContent = `Status: XInput error${result?.error ? ` - ${result.error}` : ''}`;
      return;
    }
  }
  if (xinputEnabled) {
    sendXinputState(prevButtons);
  }
};

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

xinputMapping = loadXinputMapping();
buildXinputMappingUI();
xinputCalibration = loadXinputCalibration();
buildXinputCalibrationUI();
const xinputResetCalibration = document.getElementById('xinput-reset-calibration');
if (xinputResetCalibration) {
  xinputResetCalibration.addEventListener('click', () => {
    xinputCalibration = { ...DEFAULT_XINPUT_CALIBRATION };
    saveXinputCalibration();
    buildXinputCalibrationUI();
  });
}
const storedXinputEnabled = localStorage.getItem(XINPUT_ENABLED_KEY);
if (storedXinputEnabled !== null) {
  xinputEnabled = storedXinputEnabled === 'true';
}
if (xinputToggle) {
  xinputToggle.checked = xinputEnabled;
  xinputToggle.addEventListener('change', (e) => {
    setXinputEnabled(e.target.checked);
  });
}
if (xinputEnabled) {
  setXinputEnabled(true);
}

autosyncToggle.addEventListener('change', (e) => {
  autosyncEnabled = e.target.checked;
  localStorage.setItem('wiimote-autosync', autosyncEnabled);
  if (autosyncEnabled) {
    attemptAutoConnect();
  }
});

const didSyncSucceed = (result) => {
  if (!result) return false;
  if (result.ok) return true;
  const stdout = result.stdout || '';
  return stdout.includes('Found Wiimote') && stdout.includes('BluetoothSetServiceState result: 0');
};

if (syncBtn) {
  syncBtn.addEventListener('click', async () => {
    try {
      const result = await runSync('manual');
      if (didSyncSucceed(result)) {
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
let bUsedAsModifier = false;
let bNextBShouldBeSlow = false;
let aPressedTime = 0;
let aActionTriggered = false;
let prevButtons = {};
let isAltDown = false;

const MODES = {
  MEDIA: 'Media Playback',
  NAV: 'Browser/Navigation',
  PRES: 'Presentation',
  KBD: 'Keyboard'
};
let currentMode = MODES.MEDIA;

let isShifted = false;

const KEYBOARD_LAYOUTS = {
  default: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "{bksp}"],
    ["{tab}", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", "{enter}"],
    ["{shift}", "z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
    ["{space}"]
  ],
  shift: [
    ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "_", "+", "{bksp}"],
    ["{tab}", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "{", "}", "|"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", ":", "\"", "{enter}"],
    ["{shift}", "Z", "X", "C", "V", "B", "N", "M", "<", ">", "?"],
    ["{space}"]
  ]
};

// Flattened index mapping to row/col for easier navigation
let currentKbdRow = 0;
let currentKbdCol = 0;
let lastKbdPercent = 0; // Remembers horizontal percentage (0.0 to 1.0) for logical vertical snapping

// Helper to get logical width percentage of a key in a row
function getKeyWidths(row) {
  // Simple approximation: standard keys are 1 unit, special keys are wider
  return row.map(key => {
    if (key === "{space}") return 5;
    if (key === "{shift}" || key === "{enter}" || key === "{bksp}" || key === "{tab}") return 1.5;
    return 1;
  });
}

function getKeyPosition(row, col) {
  const widths = getKeyWidths(row);
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  let currentPos = 0;
  for (let i = 0; i < col; i++) {
    currentPos += widths[i];
  }
  // Return center position as percentage
  return (currentPos + widths[col] / 2) / totalWidth;
}

function findClosestCol(row, targetPercent) {
  const widths = getKeyWidths(row);
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  let bestCol = 0;
  let minDiff = Infinity;
  let currentPos = 0;

  for (let i = 0; i < row.length; i++) {
    const center = (currentPos + widths[i] / 2) / totalWidth;
    const diff = Math.abs(center - targetPercent);
    if (diff < minDiff) {
      minDiff = diff;
      bestCol = i;
    }
    currentPos += widths[i];
  }
  return bestCol;
}

function initKeyboard() {
  const layout = isShifted ? KEYBOARD_LAYOUTS.shift : KEYBOARD_LAYOUTS.default;
  lastKbdPercent = getKeyPosition(layout[currentKbdRow], currentKbdCol);
  updateKeyboardSelection();
}

async function initWiimoteDisplay() {
  if (!wiimoteDisplay || wiimoteSvgInitialized) return;

  const url = new URL('./assets/wiimote.svg', import.meta.url);
  const response = await fetch(url);
  const svgText = await response.text();
  wiimoteDisplay.innerHTML = '';

  const nunchukBody = document.createElement('div');
  nunchukBody.id = 'nunchuk-body';
  const nunchukUrl = new URL('./assets/nunchuck.svg', import.meta.url);
  const nunchukResponse = await fetch(nunchukUrl);
  const nunchukSvgText = await nunchukResponse.text();
  nunchukBody.innerHTML = nunchukSvgText;
  nunchukBody.style.display = 'none';
  wiimoteDisplay.appendChild(nunchukBody);
  const stickEl = nunchukBody.querySelector('#nunchuk-stick');
  if (stickEl) {
    nunchukStickVisual.el = stickEl;
    nunchukStickVisual.cx0 = parseFloat(stickEl.getAttribute('cx') || '0');
    nunchukStickVisual.cy0 = parseFloat(stickEl.getAttribute('cy') || '0');
    nunchukStickVisual.x = 0;
    nunchukStickVisual.y = 0;
  }

  const wiimoteBody = document.createElement('div');
  wiimoteBody.id = 'wiimote-body';
  wiimoteBody.innerHTML = svgText;
  wiimoteDisplay.appendChild(wiimoteBody);

  const dpadImg = document.createElement('img');
  dpadImg.id = 'wiimote-dpad';
  dpadImg.alt = 'D-Pad';
  dpadImg.src = new URL('./assets/dpad.svg', import.meta.url).toString();
  wiimoteBody.appendChild(dpadImg);

  wiimoteSvgInitialized = true;
  updateWiimoteLedDisplay();
}

function updateWiimoteDisplayState(buttons) {
  if (!wiimoteDisplay || !wiimoteSvgInitialized) return;

  updateWiimoteLedDisplay();

  const buttonIdByName = {
    A: 'wiimote-btn-A',
    B: 'wiimote-btn-B',
    HOME: 'wiimote-btn-HOME',
    PLUS: 'wiimote-btn-PLUS',
    MINUS: 'wiimote-btn-MINUS'
  };

  for (const [btn, id] of Object.entries(buttonIdByName)) {
    const el = wiimoteDisplay.querySelector(`#${id}`);
    if (!el) continue;
    el.classList.toggle('wiimote-held', Boolean(buttons?.[btn]));
  }

  const dpad = wiimoteDisplay.querySelector('#wiimote-dpad');
  if (!dpad) return;

  const isUp = Boolean(buttons?.UP);
  const isDown = Boolean(buttons?.DOWN);
  const isLeft = Boolean(buttons?.LEFT);
  const isRight = Boolean(buttons?.RIGHT);

  let dpadSrc = new URL('./assets/dpad.svg', import.meta.url).toString();
  let rotationDeg = 0;

  if (isUp && isDown) {
    dpadSrc = new URL('./assets/dpad_both.svg', import.meta.url).toString();
  } else if (isLeft && isRight) {
    dpadSrc = new URL('./assets/dpad_both.svg', import.meta.url).toString();
    rotationDeg = 90;
  } else if (isUp) {
    dpadSrc = new URL('./assets/dpad_up.svg', import.meta.url).toString();
  } else if (isRight) {
    dpadSrc = new URL('./assets/dpad_up.svg', import.meta.url).toString();
    rotationDeg = 90;
  } else if (isDown) {
    dpadSrc = new URL('./assets/dpad_up.svg', import.meta.url).toString();
    rotationDeg = 180;
  } else if (isLeft) {
    dpadSrc = new URL('./assets/dpad_up.svg', import.meta.url).toString();
    rotationDeg = -90;
  }

  if (dpad.src !== dpadSrc) {
    dpad.src = dpadSrc;
  }
  dpad.style.transform = `rotate(${rotationDeg}deg)`;
}

function updateWiimoteLedDisplay() {
  if (!wiimoteDisplay || !wiimoteSvgInitialized) return;

  const ledStatesByMode = {
    [MODES.MEDIA]: [true, false, false, false],
    [MODES.NAV]: [false, true, false, false],
    [MODES.PRES]: [false, false, true, false],
    [MODES.KBD]: [false, false, false, true]
  };

  let ledStates = ledStatesByMode[currentMode] ?? [false, false, false, false];
  if (syncInProgress) {
    ledStates = [ledFlashOn, ledFlashOn, ledFlashOn, ledFlashOn];
  } else if (!wiimoteConnected) {
    ledStates = [false, false, false, false];
  } else if (xinputEnabled) {
    ledStates = [true, false, false, true];
  }
  for (let i = 0; i < 4; i += 1) {
    const led = wiimoteDisplay.querySelector(`#wiimote-led-${i + 1}`);
    if (!led) continue;
    led.classList.toggle('wiimote-led-on', ledStates[i]);
  }
}

function setLedFlashActive(active) {
  if (active) {
    if (ledFlashInterval) return;
    ledFlashOn = true;
    updateWiimoteLedDisplay();
    ledFlashInterval = setInterval(() => {
      ledFlashOn = !ledFlashOn;
      updateWiimoteLedDisplay();
    }, 150);
    return;
  }
  if (ledFlashInterval) {
    clearInterval(ledFlashInterval);
    ledFlashInterval = null;
  }
  ledFlashOn = false;
  updateWiimoteLedDisplay();
}

function handlePhysicalKeyPress(button) {
  if (button === "{space}") {
    systemApi.navControl('space');
  } else if (button === "{enter}") {
    systemApi.navControl('enter');
  } else if (button === "{tab}") {
    systemApi.navControl('tab');
  } else if (button === "{bksp}") {
    systemApi.navControl('backspace');
  } else if (button === "{shift}") {
    isShifted = !isShifted;
    updateKeyboardSelection();
  } else {
    systemApi.typeText(button);
  }
}

function updateKeyboardSelection() {
  if (currentMode === MODES.KBD) {
    const layout = isShifted ? KEYBOARD_LAYOUTS.shift : KEYBOARD_LAYOUTS.default;
    const key = layout[currentKbdRow][currentKbdCol];
    if (key) {
      // Escape backslash for querySelector if it's the raw character
      let selectorKey = key;
      if (key === "\\") selectorKey = "\\\\";
      systemApi.updateKeyboardSelection({
        key: key,
        selectorKey: selectorKey,
        layout: isShifted ? 'shift' : 'default'
      });
    }
  }
}

function moveKeyboardSelection(direction) {
  const layout = isShifted ? KEYBOARD_LAYOUTS.shift : KEYBOARD_LAYOUTS.default;
  const numRows = layout.length;

  if (direction === 'RIGHT') {
    currentKbdCol = (currentKbdCol + 1) % layout[currentKbdRow].length;
    lastKbdPercent = getKeyPosition(layout[currentKbdRow], currentKbdCol);
  }
  else if (direction === 'LEFT') {
    currentKbdCol = (currentKbdCol - 1 + layout[currentKbdRow].length) % layout[currentKbdRow].length;
    lastKbdPercent = getKeyPosition(layout[currentKbdRow], currentKbdCol);
  }
  else if (direction === 'DOWN') {
    currentKbdRow = (currentKbdRow + 1) % numRows;
    // Snap to the key closest to the last recorded horizontal percentage
    currentKbdCol = findClosestCol(layout[currentKbdRow], lastKbdPercent);
  }
  else if (direction === 'UP') {
    currentKbdRow = (currentKbdRow - 1 + numRows) % numRows;
    // Snap to the key closest to the last recorded horizontal percentage
    currentKbdCol = findClosestCol(layout[currentKbdRow], lastKbdPercent);
  }
  updateKeyboardSelection();
}

function typeSelectedKey() {
  const layout = isShifted ? KEYBOARD_LAYOUTS.shift : KEYBOARD_LAYOUTS.default;
  const key = layout[currentKbdRow][currentKbdCol];
  if (key) {
    handlePhysicalKeyPress(key);
  }
}

// Call init on load
window.addEventListener('DOMContentLoaded', () => {
  initKeyboard();
  initWiimoteDisplay();
});

async function connectToDevice(device) {
  try {
    console.log('Renderer connectToDevice start', { productName: device?.productName, vendorId: device?.vendorId, productId: device?.productId });
    wiimote = new Wiimote(device);
    statusDiv.textContent = `Status: Connecting to ${device.productName}...`;
    
    await wiimote.init();
    wiimoteConnected = true;
    
    statusDiv.textContent = `Status: Connected to ${device.productName}`;
    console.log('Renderer connected', { productName: device?.productName });

    // Initialize LED for first mode
    applyCurrentLedState();
    setLedFlashActive(false);
    updateWiimoteLedDisplay();

    wiimote.onButtonUpdate = (buttons, report) => {
      const now = Date.now();
      const bReleased = !buttons.B && prevButtons.B;
      const aReleased = !buttons.A && prevButtons.A;
      if (report && now - lastWiimoteLogAt > 1000) {
        console.log('Wiimote input report', { reportId: report.reportId });
        lastWiimoteLogAt = now;
      }

      if (report?.reportId === 0x20) {
        const status2 = report.data.getUint8(2);
        const status3 = report.data.getUint8(3);
        const extensionConnected = Boolean((status3 & 0x02) || (status2 & 0x02));
        if (now - lastNunchukLogAt > 1000) {
          console.log('Nunchuk status', { extensionConnected, status2, status3 });
          lastNunchukLogAt = now;
        }
        if (nunchukActive && !extensionConnected) {
          systemApi.navControl('mouse-left-up');
          systemApi.navControl('mouse-right-up');
          prevNunchukButtons = { z: false, c: false };
          resetMouseMove();
          lastNunchukState = { stickX: 0, stickY: 0, cPressed: false, zPressed: false };
        }
        nunchukActive = extensionConnected;
        const nb = wiimoteDisplay.querySelector('#nunchuk-body');
        if (nb) nb.style.display = extensionConnected ? 'block' : 'none';
        return;
      }

      if (report?.reportId === 0x35) {
        nunchukActive = true;
        const nb = wiimoteDisplay.querySelector('#nunchuk-body');
        if (nb) nb.style.display = 'block';
        if (now - lastNunchukLogAt > 1000) {
          console.log('Nunchuk report received');
          lastNunchukLogAt = now;
        }
        const nunchukData = new DataView(report.data.buffer, 5, 16);
        const stickX = (nunchukData.getUint8(0) - 128) / 128;
        const stickY = (nunchukData.getUint8(1) - 128) / 128;
        const zPressed = (nunchukData.getUint8(5) & 0x01) === 0;
        const cPressed = (nunchukData.getUint8(5) & 0x02) === 0;
        if (now - lastNunchukInputLogAt > 1000) {
          console.log('Nunchuk input', { stickX, stickY, zPressed, cPressed });
          lastNunchukInputLogAt = now;
        }

        lastNunchukState = { stickX, stickY, cPressed, zPressed };
        updateXinputCalibrationDisplay();

        const deadzone = 0.08;
        let moveX = 0;
        let moveY = 0;

        if (Math.abs(stickX) > deadzone) {
          const sign = Math.sign(stickX);
          const value = Math.abs(stickX);
          moveX = sign * ((value - deadzone) / (1.0 - deadzone));
        }

        if (Math.abs(stickY) > deadzone) {
          const sign = Math.sign(stickY);
          const value = Math.abs(stickY);
          moveY = sign * ((value - deadzone) / (1.0 - deadzone));
        }

        if (!xinputEnabled) {
          if (moveX !== 0 || moveY !== 0) {
            queueMouseMove(moveX * 20, -moveY * 20);
          }
        }

        const zEl = wiimoteDisplay.querySelector('#nunchuk-btn-Z');
        const cEl = wiimoteDisplay.querySelector('#nunchuk-btn-C');
        const stickEl = wiimoteDisplay.querySelector('#nunchuk-stick');
        if (zEl) zEl.classList.toggle('nunchuk-held', zPressed);
        if (cEl) cEl.classList.toggle('nunchuk-held', cPressed);
        if (stickEl) {
          stickEl.classList.toggle('nunchuk-held', (Math.abs(stickX) > deadzone || Math.abs(stickY) > deadzone));
        }

        if (nunchukStickVisual.el) {
          const maxDeflect = 4.5;
          const targetX = stickX * maxDeflect;
          const targetY = -stickY * maxDeflect;
          nunchukStickVisual.x += (targetX - nunchukStickVisual.x) * 0.35;
          nunchukStickVisual.y += (targetY - nunchukStickVisual.y) * 0.35;
          const cx = (nunchukStickVisual.cx0 + nunchukStickVisual.x).toFixed(2);
          const cy = (nunchukStickVisual.cy0 + nunchukStickVisual.y).toFixed(2);
          nunchukStickVisual.el.setAttribute('cx', cx);
          nunchukStickVisual.el.setAttribute('cy', cy);
        }

        if (!xinputEnabled) {
          if (zPressed && !prevNunchukButtons.z) {
            systemApi.navControl('mouse-left-down');
          } else if (!zPressed && prevNunchukButtons.z) {
            systemApi.navControl('mouse-left-up');
          }

          if (cPressed && !prevNunchukButtons.c) {
            systemApi.navControl('mouse-right-down');
          } else if (!cPressed && prevNunchukButtons.c) {
            systemApi.navControl('mouse-right-up');
          }
        }

        prevNunchukButtons = { z: zPressed, c: cPressed };
      }

      if (xinputEnabled) {
        sendXinputState(buttons);
        prevButtons = { ...buttons };
        updateWiimoteDisplayState(buttons);
        return;
      }

      // Detection of button transitions
      if (buttons.B && !prevButtons.B) {
        bPressedTime = now;
        bActionTriggered = false;
        bUsedAsModifier = false;
        console.log('B pressed - tracking for chord');
      }
      if (buttons.A && !prevButtons.A) {
        aPressedTime = now;
        aActionTriggered = false;
        console.log('A pressed - tracking for chord');
      }

      if (!buttons.UP && prevButtons.UP) {
        if (currentMode === MODES.PRES && isAltDown) {
          // Keep isAltDown true, but reset lastButtonPressed so another press can trigger
          if (lastButtonPressed === 'UP-ARROW') lastButtonPressed = null;
        }
      }
      if (!buttons.DOWN && prevButtons.DOWN) {
        if (currentMode === MODES.PRES && isAltDown) {
          // Keep isAltDown true, but reset lastButtonPressed so another press can trigger
          if (lastButtonPressed === 'DOWN-ARROW') lastButtonPressed = null;
        }
      }

      // Handle release actions for A and B
      if (aReleased) {
        if (currentMode === MODES.PRES && isAltDown) {
          console.log('A released in PRES mode - releasing Alt');
          systemApi.navControl('alt-up');
          isAltDown = false;
        }
        if ((currentMode === MODES.NAV || currentMode === MODES.PRES) && !aActionTriggered && aPressedTime !== 0 && (now - aPressedTime < 1000)) {
          console.log('A released (no chord) - triggering click');
          systemApi.navControl('click');
        }
        aPressedTime = 0;
      }
      
      // Mode Switching (- or +)
      if ((buttons.MINUS || buttons.PLUS) && lastButtonPressed !== 'MODE') {
        // If we're switching modes while Alt is down, release it first
        if (isAltDown) {
          console.log('Mode switch detected while Alt down - releasing Alt');
          systemApi.navControl('alt-up');
          isAltDown = false;
        }

        if (buttons.PLUS) {
          // Cycle forward: Media -> Nav -> Pres -> KBD -> Media
          if (currentMode === MODES.MEDIA) currentMode = MODES.NAV;
          else if (currentMode === MODES.NAV) currentMode = MODES.PRES;
          else if (currentMode === MODES.PRES) currentMode = MODES.KBD;
          else currentMode = MODES.MEDIA;
        } else {
          // Cycle backward: Media -> KBD -> Pres -> Nav -> Media
          if (currentMode === MODES.MEDIA) currentMode = MODES.KBD;
          else if (currentMode === MODES.KBD) currentMode = MODES.PRES;
          else if (currentMode === MODES.PRES) currentMode = MODES.NAV;
          else currentMode = MODES.MEDIA;
        }
        lastButtonPressed = 'MODE';
        
        // Update LEDs to indicate mode
        applyCurrentLedState();
        updateWiimoteLedDisplay();

        // Update UI
        if (modeTitle) modeTitle.textContent = `Mode: ${currentMode}`;
        if (mediaHelp) mediaHelp.style.display = currentMode === MODES.MEDIA ? 'block' : 'none';
        if (navHelp) navHelp.style.display = currentMode === MODES.NAV ? 'block' : 'none';
        
        const presHelp = document.getElementById('pres-controls');
        if (presHelp) presHelp.style.display = currentMode === MODES.PRES ? 'block' : 'none';

        const kbdHelp = document.getElementById('kbd-controls');
        if (kbdHelp) kbdHelp.style.display = currentMode === MODES.KBD ? 'block' : 'none';
        
        // Handle PIP Keyboard visibility
        if (systemApi?.toggleKeyboard) {
          systemApi.toggleKeyboard(currentMode === MODES.KBD);
        }

        if (currentMode === MODES.KBD) {
          setTimeout(updateKeyboardSelection, 100);
        }
        
        console.log(`Switched to mode: ${currentMode}`);
        return;
      }
      if (!buttons.MINUS && !buttons.PLUS && lastButtonPressed === 'MODE') {
        lastButtonPressed = null;
      }

      // Navigation and Keyboard Mode chording detection
      if (currentMode === MODES.NAV || currentMode === MODES.PRES || currentMode === MODES.KBD) {
        if (buttons.B && (buttons.LEFT || buttons.RIGHT || buttons.UP || buttons.DOWN || buttons.A)) {
          bActionTriggered = true;
          bUsedAsModifier = true;
        }
        if ((currentMode === MODES.NAV || currentMode === MODES.PRES) && buttons.A && (buttons.UP || buttons.DOWN || buttons.B)) {
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
      } else if (currentMode === MODES.PRES) {
        // Presentation Mode
        if (buttons.LEFT) pressedButton = 'LEFT-ARROW';
        else if (buttons.RIGHT) pressedButton = 'RIGHT-ARROW';
          else if (buttons.UP) {
            if (!isAltDown) {
              systemApi.navControl('alt-tab-start');
              isAltDown = true;
            }
            pressedButton = 'UP-ARROW';
          }
          else if (buttons.DOWN) {
            if (!isAltDown) {
              systemApi.navControl('alt-tab-start');
              isAltDown = true;
            }
            pressedButton = 'DOWN-ARROW';
          }
        else if (buttons.A) {
          if (buttons.B) pressedButton = 'CLOSE-WINDOW';
          else pressedButton = 'A';
        }
        else if (buttons.HOME) {
          if (currentMode === MODES.KBD) {
            // Exit keyboard mode back to presentation or nav
            currentMode = MODES.PRES;
            // Update UI
            if (modeTitle) modeTitle.textContent = `Mode: ${currentMode}`;
            const kbdHelp = document.getElementById('kbd-controls');
            if (kbdHelp) kbdHelp.style.display = 'none';
            const kbdContainer = document.getElementById('keyboard-container');
            if (kbdContainer) kbdContainer.style.display = 'none';
            const presHelp = document.getElementById('pres-controls');
            if (presHelp) presHelp.style.display = 'block';
            applyCurrentLedState();
          } else {
            pressedButton = 'START-PRES';
          }
        }
      } else if (currentMode === MODES.KBD) {
        // Keyboard Mode
        if (buttons.UP) {
          pressedButton = buttons.B ? 'KBD-ARROW-UP' : 'KBD-UP';
        } else if (buttons.DOWN) {
          pressedButton = buttons.B ? 'KBD-ARROW-DOWN' : 'KBD-DOWN';
        } else if (buttons.LEFT) {
          pressedButton = buttons.B ? 'KBD-ARROW-LEFT' : 'KBD-LEFT';
        } else if (buttons.RIGHT) {
          pressedButton = buttons.B ? 'KBD-ARROW-RIGHT' : 'KBD-RIGHT';
        } else if (buttons.A) {
          pressedButton = 'KBD-TYPE';
        } else if (buttons.B) {
          pressedButton = 'KBD-BACKSPACE';
        } else if (buttons.ONE) {
          pressedButton = 'KBD-SPACE';
        } else if (buttons.TWO) {
          pressedButton = 'KBD-ENTER';
        } else if (buttons.HOME) {
          pressedButton = 'KBD-SHIFT';
        }
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
          if ((pressedButton === 'KBD-BACKSPACE' || pressedButton === 'B') && (bUsedAsModifier || bNextBShouldBeSlow)) {
            currentCooldown = INITIAL_COOLDOWN * 2;
            bNextBShouldBeSlow = false;
            bUsedAsModifier = false;
          } else {
            currentCooldown = (pressedButton === 'UP' || pressedButton === 'DOWN') && currentMode === MODES.NAV 
              ? SCROLL_COOLDOWN 
              : ((pressedButton === 'UP-ARROW' || pressedButton === 'DOWN-ARROW') && currentMode === MODES.PRES
                  ? 250 // Slightly faster but still limited for window switching
                  : INITIAL_COOLDOWN);
          }
            
          lastButtonPressed = pressedButton;
          
          // Execute immediately on first press
          if (currentMode === MODES.MEDIA) {
            if (pressedButton === 'UP') systemApi.changeVolume('up');
            else if (pressedButton === 'DOWN') systemApi.changeVolume('down');
            else if (pressedButton === 'LEFT') systemApi.mediaControl('previous');
            else if (pressedButton === 'RIGHT') systemApi.mediaControl('next');
            else if (pressedButton === 'A') systemApi.mediaControl('play-pause');
          } else if (currentMode === MODES.NAV) {
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
          } else if (currentMode === MODES.PRES) {
            // Presentation Mode
            if (pressedButton === 'LEFT-ARROW') systemApi.navControl('left-arrow');
            else if (pressedButton === 'RIGHT-ARROW') systemApi.navControl('right-arrow');
            else if (pressedButton === 'CLOSE-WINDOW') systemApi.navControl('close-window');
            else if (pressedButton === 'START-PRES') systemApi.navControl('start-presentation');
            else if (pressedButton === 'UP-ARROW') systemApi.navControl('up-arrow');
            else if (pressedButton === 'DOWN-ARROW') systemApi.navControl('down-arrow');
          } else if (currentMode === MODES.KBD) {
            // Keyboard Mode actions
            if (pressedButton === 'KBD-UP') moveKeyboardSelection('UP');
            else if (pressedButton === 'KBD-DOWN') moveKeyboardSelection('DOWN');
            else if (pressedButton === 'KBD-LEFT') moveKeyboardSelection('LEFT');
            else if (pressedButton === 'KBD-RIGHT') moveKeyboardSelection('RIGHT');
            else if (pressedButton === 'KBD-TYPE') typeSelectedKey();
            else if (pressedButton === 'KBD-BACKSPACE') {
              // Don't trigger backspace immediately, wait for release or hold
              console.log('B button held in KBD (modifier candidate)');
            }
            else if (pressedButton === 'KBD-SPACE') systemApi.navControl('space');
            else if (pressedButton === 'KBD-ENTER') systemApi.navControl('enter');
            else if (pressedButton === 'KBD-ARROW-UP') systemApi.navControl('up-arrow');
            else if (pressedButton === 'KBD-ARROW-DOWN') systemApi.navControl('down-arrow');
            else if (pressedButton === 'KBD-ARROW-LEFT') systemApi.navControl('left-arrow');
            else if (pressedButton === 'KBD-ARROW-RIGHT') systemApi.navControl('right-arrow');
            else if (pressedButton === 'KBD-SHIFT') {
              isShifted = !isShifted;
              updateKeyboardSelection();
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
            } else if (currentMode === MODES.NAV) {
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
            } else if (currentMode === MODES.PRES) {
              // Presentation Mode repeats
              if (pressedButton === 'LEFT-ARROW') systemApi.navControl('left-arrow');
              else if (pressedButton === 'RIGHT-ARROW') systemApi.navControl('right-arrow');
              else if (pressedButton === 'UP-ARROW') systemApi.navControl('up-arrow');
              else if (pressedButton === 'DOWN-ARROW') systemApi.navControl('down-arrow');
            } else if (currentMode === MODES.KBD) {
              // Keyboard Mode repeats
              if (pressedButton === 'KBD-UP') moveKeyboardSelection('UP');
              else if (pressedButton === 'KBD-DOWN') moveKeyboardSelection('DOWN');
              else if (pressedButton === 'KBD-LEFT') moveKeyboardSelection('LEFT');
              else if (pressedButton === 'KBD-RIGHT') moveKeyboardSelection('RIGHT');
              else if (pressedButton === 'KBD-BACKSPACE') {
                systemApi.navControl('backspace');
                bActionTriggered = true; // Prevent release from triggering another backspace
              }
              else if (pressedButton === 'KBD-SPACE') systemApi.navControl('space');
              else if (pressedButton === 'KBD-ARROW-UP') systemApi.navControl('up-arrow');
              else if (pressedButton === 'KBD-ARROW-DOWN') systemApi.navControl('down-arrow');
              else if (pressedButton === 'KBD-ARROW-LEFT') systemApi.navControl('left-arrow');
              else if (pressedButton === 'KBD-ARROW-RIGHT') systemApi.navControl('right-arrow');
              else if (pressedButton === 'KBD-TYPE') {
                const layout = isShifted ? KEYBOARD_LAYOUTS.shift : KEYBOARD_LAYOUTS.default;
                const key = layout[currentKbdRow][currentKbdCol];
                if (key !== "{shift}") typeSelectedKey();
              }
            }

            // Reduce cooldown for next repeat (only for certain buttons)
            const accelButtons = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'TAB', 'SHIFT-TAB', 'PAGE-UP', 'PAGE-DOWN', 'ZOOM-IN', 'ZOOM-OUT', 'LEFT-ARROW', 'RIGHT-ARROW', 'KBD-UP', 'KBD-DOWN', 'KBD-LEFT', 'KBD-RIGHT', 'KBD-BACKSPACE', 'KBD-SPACE', 'KBD-TYPE', 'B', 'KBD-ARROW-UP', 'KBD-ARROW-DOWN', 'KBD-ARROW-LEFT', 'KBD-ARROW-RIGHT'];
            if (accelButtons.includes(pressedButton)) {
              if (currentMode === MODES.NAV && (pressedButton === 'UP' || pressedButton === 'DOWN')) {
                currentCooldown = SCROLL_COOLDOWN; // Keep scroll constant and fast
              } else if (currentMode === MODES.PRES) {
                currentCooldown = Math.max(currentCooldown, 250);
              } else {
                currentCooldown = Math.max(MIN_COOLDOWN, currentCooldown * 0.8);
              }
              lastVolumeChange = now;
            }
          }
        } else if (lastButtonPressed !== 'MODE') {
          // Button released
          if ((lastButtonPressed === 'B' || lastButtonPressed === 'KBD-BACKSPACE') && (currentMode === MODES.NAV || currentMode === MODES.PRES || currentMode === MODES.KBD)) {
            // If B was released and not used as a modifier, trigger action
            if (!bActionTriggered && bPressedTime !== 0 && (now - bPressedTime < 1000)) {
              if (currentMode === MODES.KBD) {
                console.log('B released in KBD - triggering backspace');
                systemApi.navControl('backspace');
              } else {
                console.log('B released - triggering refresh');
                systemApi.navControl('refresh');
              }
            }
            if (bUsedAsModifier) {
              bNextBShouldBeSlow = true;
            }
          }
          else if (lastButtonPressed === 'A' && (currentMode === MODES.NAV || currentMode === MODES.PRES)) {
            // If A was released and not used as a modifier, trigger click
            if (!aActionTriggered && aPressedTime !== 0 && (now - aPressedTime < 1000)) {
              console.log('A released - triggering click');
              systemApi.navControl('click');
            }
          }
          lastButtonPressed = null;
          currentCooldown = INITIAL_COOLDOWN;
        }

      // Update button state history
      if (bReleased) {
        bPressedTime = 0;
      }
      prevButtons = { ...buttons };
      updateWiimoteDisplayState(buttons);
    };

    device.addEventListener('forget', () => {
      wiimote = null;
      wiimoteConnected = false;
      currentMode = MODES.MEDIA;
      statusDiv.textContent = 'Status: Disconnected (Device forgotten)';
      console.warn('Renderer device forgotten');
      nunchukActive = false;
      prevNunchukButtons = { z: false, c: false };
      resetMouseMove();
      systemApi.navControl('mouse-left-up');
      systemApi.navControl('mouse-right-up');
      if (modeTitle) modeTitle.textContent = `Mode: ${currentMode}`;
      if (mediaHelp) mediaHelp.style.display = currentMode === MODES.MEDIA ? 'block' : 'none';
      if (navHelp) navHelp.style.display = currentMode === MODES.NAV ? 'block' : 'none';
      const presHelp = document.getElementById('pres-controls');
      if (presHelp) presHelp.style.display = currentMode === MODES.PRES ? 'block' : 'none';
      const kbdHelp = document.getElementById('kbd-controls');
      if (kbdHelp) kbdHelp.style.display = currentMode === MODES.KBD ? 'block' : 'none';
      const nb = wiimoteDisplay.querySelector('#nunchuk-body');
      if (nb) nb.style.display = 'none';
      updateWiimoteLedDisplay();
    });

  } catch (error) {
    wiimote = null;
    wiimoteConnected = false;
    updateWiimoteLedDisplay();
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
  if (didSyncSucceed(result)) {
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
  setLedFlashActive(true);
  console.log('Invoking native sync helper', { mode, pairing: guestToggle ? (guestToggle.checked ? 'guest' : 'bond') : (guestMode ? 'guest' : 'bond') });
  statusDiv.textContent = mode === 'auto'
    ? 'Status: Auto-syncing Wii Remote...'
    : 'Status: Syncing Wii Remote...';
  const useGuest = guestToggle ? guestToggle.checked : guestMode;
  const result = await systemApi.syncWiimote(useGuest ? 'guest' : 'bond');
  syncInProgress = false;
  setLedFlashActive(false);
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
    console.log('Renderer connect button clicked');
    statusDiv.textContent = 'Status: Searching...';
    
    // Request Wii Remote device
    // Nintendo Vendor ID: 0x057e
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: 0x057e }]
    });

    if (devices.length > 0) {
      console.log('Renderer device selected', { productName: devices[0]?.productName, vendorId: devices[0]?.vendorId, productId: devices[0]?.productId });
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
  console.log('Renderer startup devices', { count: devices.length });
  const wiiRemote = devices.find(d => d.vendorId === 0x057e);
  if (wiiRemote && autosyncEnabled) {
    console.log('Renderer auto-connect device found', { productName: wiiRemote?.productName, vendorId: wiiRemote?.vendorId, productId: wiiRemote?.productId });
    connectToDevice(wiiRemote);
  }
}

startupCheck();

// Listen for device connections
navigator.hid.addEventListener('connect', (event) => {
  if (autosyncEnabled && event.device.vendorId === 0x057e && !wiimote) {
    console.log('Renderer HID connect event', { productName: event.device?.productName, vendorId: event.device?.vendorId, productId: event.device?.productId });
    connectToDevice(event.device);
  }
});

navigator.hid.addEventListener('disconnect', (event) => {
  if (wiimote && event.device?.vendorId === 0x057e) {
    console.warn('Renderer HID disconnect event', { productName: event.device?.productName, vendorId: event.device?.vendorId, productId: event.device?.productId });
    wiimote = null;
    wiimoteConnected = false;
    currentMode = MODES.MEDIA;
    nunchukActive = false;
    prevNunchukButtons = { z: false, c: false };
    resetMouseMove();
    systemApi.navControl('mouse-left-up');
    systemApi.navControl('mouse-right-up');
    statusDiv.textContent = 'Status: Disconnected';
    if (modeTitle) modeTitle.textContent = `Mode: ${currentMode}`;
    if (mediaHelp) mediaHelp.style.display = currentMode === MODES.MEDIA ? 'block' : 'none';
    if (navHelp) navHelp.style.display = currentMode === MODES.NAV ? 'block' : 'none';
    const presHelp = document.getElementById('pres-controls');
    if (presHelp) presHelp.style.display = currentMode === MODES.PRES ? 'block' : 'none';
    const kbdHelp = document.getElementById('kbd-controls');
    if (kbdHelp) kbdHelp.style.display = currentMode === MODES.KBD ? 'block' : 'none';
    const nb = wiimoteDisplay.querySelector('#nunchuk-body');
    if (nb) nb.style.display = 'none';
    updateWiimoteLedDisplay();
  }
});

console.log('Renderer process initialized');
