import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, exec } from 'node:child_process';
import started from 'electron-squirrel-startup';
import ViGEmClient from 'vigemclient';

let mainWindow;
let keyboardWindow;
let lastMouseMoveAt = 0;
let mouseWorker = null;
let xinputClient = null;
let xinputController = null;
let xinputEnabled = false;

const startMouseWorker = () => {
  if (mouseWorker) {
    return;
  }
  const script = "$ErrorActionPreference='Stop'; Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void mouse_event(int dwFlags,int dx,int dy,int dwData,int dwExtraInfo);' -Name 'Win32Mouse' -Namespace 'Win32Utils' | Out-Null; while($true){$line=[Console]::In.ReadLine(); if($null -eq $line){break}; $parts=$line.Split(' '); if($parts.Length -ge 3 -and $parts[0] -eq 'MOVE'){[Win32Utils.Win32Mouse]::mouse_event(0x0001,[int]$parts[1],[int]$parts[2],0,0)}}";
  mouseWorker = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  mouseWorker.on('exit', () => {
    mouseWorker = null;
  });
  mouseWorker.stderr?.on('data', (data) => {
    console.error('Mouse worker error', data.toString().trim());
  });
};

const ensureXinputController = () => {
  if (!xinputClient) {
    xinputClient = new ViGEmClient();
    const err = xinputClient.connect();
    if (err) {
      xinputClient = null;
      throw err;
    }
  }
  if (!xinputController) {
    xinputController = xinputClient.createX360Controller();
    const err = xinputController.connect();
    if (err) {
      xinputController = null;
      throw err;
    }
    xinputController.updateMode = 'manual';
  }
};

const resetXinputController = () => {
  if (!xinputController) return;
  xinputController.resetInputs();
  xinputController.update();
  xinputController.disconnect();
  xinputController = null;
};

ipcMain.handle('xinput-toggle', async (_event, enabled) => {
  const desired = Boolean(enabled);
  if (!desired) {
    xinputEnabled = false;
    resetXinputController();
    return { ok: true };
  }
  try {
    ensureXinputController();
    xinputEnabled = true;
    return { ok: true };
  } catch (error) {
    xinputEnabled = false;
    resetXinputController();
    return { ok: false, error: error?.message || 'XInput initialization failed' };
  }
});

ipcMain.on('xinput-update', (_event, state) => {
  if (!xinputEnabled || !xinputController) return;
  const buttons = state?.buttons || {};
  const axes = state?.axes || {};
  const triggers = state?.triggers || {};

  const setButton = (name, value) => {
    const btn = xinputController.button?.[name];
    if (btn) btn.setValue(Boolean(value));
  };

  setButton('A', buttons.A);
  setButton('B', buttons.B);
  setButton('X', buttons.X);
  setButton('Y', buttons.Y);
  setButton('LEFT_SHOULDER', buttons.LB);
  setButton('RIGHT_SHOULDER', buttons.RB);
  setButton('START', buttons.START);
  setButton('BACK', buttons.BACK);
  setButton('LEFT_THUMB', buttons.LS);
  setButton('RIGHT_THUMB', buttons.RS);
  setButton('GUIDE', buttons.GUIDE);

  xinputController.axis.leftX.setValue(axes.leftX ?? 0);
  xinputController.axis.leftY.setValue(axes.leftY ?? 0);
  xinputController.axis.rightX.setValue(axes.rightX ?? 0);
  xinputController.axis.rightY.setValue(axes.rightY ?? 0);
  xinputController.axis.dpadHorz.setValue(axes.dpadX ?? 0);
  xinputController.axis.dpadVert.setValue(axes.dpadY ?? 0);
  xinputController.axis.leftTrigger.setValue(triggers.left ?? 0);
  xinputController.axis.rightTrigger.setValue(triggers.right ?? 0);

  xinputController.update();
});

// Navigation control using PowerShell
ipcMain.on('nav-control', (event, arg) => {
  console.log('IPC nav-control', { arg });
  let command;
  let action = typeof arg === 'string' ? arg : arg.action;
  if (action === 'mouse-move') {
    if (mouseWorker?.stdin?.writable) {
      mouseWorker.stdin.write(`MOVE ${arg.dx} ${arg.dy}\n`);
      return;
    }
    const now = Date.now();
    if (now - lastMouseMoveAt < 4) {
      return;
    }
    lastMouseMoveAt = now;
  }
  switch (action) {
    case 'click':
      // Left click using mouse_event (0x02 = left down, 0x04 = left up)
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Mouse\\" -Namespace \\"Win32Utils\\" -PassThru; $type::mouse_event(0x0002, 0, 0, 0, 0); $type::mouse_event(0x0004, 0, 0, 0, 0)"`;
      break;
    case 'mouse-move':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Mouse\\" -Namespace \\"Win32Utils\\" -PassThru; $type::mouse_event(0x0001, ${arg.dx}, ${arg.dy}, 0, 0)"`;
      break;
    case 'mouse-left-down':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Mouse\\" -Namespace \\"Win32Utils\\" -PassThru; $type::mouse_event(0x0002, 0, 0, 0, 0)"`;
      break;
    case 'mouse-left-up':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Mouse\\" -Namespace \\"Win32Utils\\" -PassThru; $type::mouse_event(0x0004, 0, 0, 0, 0)"`;
      break;
    case 'mouse-right-down':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Mouse\\" -Namespace \\"Win32Utils\\" -PassThru; $type::mouse_event(0x0008, 0, 0, 0, 0)"`;
      break;
    case 'mouse-right-up':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Mouse\\" -Namespace \\"Win32Utils\\" -PassThru; $type::mouse_event(0x0010, 0, 0, 0, 0)"`;
      break;
    case 'scroll-up':
      // Scroll up (positive value)
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Mouse\\" -Namespace \\"Win32Utils\\" -PassThru; $type::mouse_event(0x0800, 0, 0, 120, 0)"`;
      break;
    case 'scroll-down':
      // Scroll down (negative value)
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Mouse\\" -Namespace \\"Win32Utils\\" -PassThru; $type::mouse_event(0x0800, 0, 0, -120, 0)"`;
      break;
    case 'back':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('%{LEFT}')"`; // Alt + Left
      break;
    case 'forward':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('%{RIGHT}')"`; // Alt + Right
      break;
    case 'left-arrow':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{LEFT}')"`;
      break;
    case 'right-arrow':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{RIGHT}')"`;
      break;
    case 'up-arrow':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{UP}')"`;
      break;
    case 'down-arrow':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{DOWN}')"`;
      break;
    case 'close-window':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('%{F4}')"`; // Alt + F4
      break;
    case 'next-window':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('%{TAB}')"`; // Alt + Tab
      break;
    case 'prev-window':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('%+{TAB}')"`; // Alt + Shift + Tab
      break;
    case 'alt-down':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Key\\" -Namespace \\"Win32Utils\\" -PassThru; $type::keybd_event(0x12, 0, 0, 0)"`;
      break;
    case 'alt-up':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Key\\" -Namespace \\"Win32Utils\\" -PassThru; $type::keybd_event(0x12, 0, 2, 0)"`;
      break;
    case 'alt-tab-start':
      // Atomically hold Alt and tap Tab
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Key\\" -Namespace \\"Win32Utils\\" -PassThru; $type::keybd_event(0x12, 0, 0, 0); $type::keybd_event(0x09, 0, 0, 0); $type::keybd_event(0x09, 0, 2, 0)"`;
      break;
    case 'tab-only':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Key\\" -Namespace \\"Win32Utils\\" -PassThru; $type::keybd_event(0x09, 0, 0, 0); $type::keybd_event(0x09, 0, 2, 0)"`;
      break;
    case 'shift-tab-only':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Key\\" -Namespace \\"Win32Utils\\" -PassThru; $type::keybd_event(0x10, 0, 0, 0); $type::keybd_event(0x09, 0, 0, 0); $type::keybd_event(0x09, 0, 2, 0); $type::keybd_event(0x10, 0, 2, 0)"`;
      break;
    case 'refresh':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{F5}')"`;
      break;
    case 'start-presentation':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{F5}')"`;
      break;
    case 'tab':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Key\\" -Namespace \\"Win32Utils\\" -PassThru; $type::keybd_event(0x09, 0, 0, 0); $type::keybd_event(0x09, 0, 2, 0)"`;
      break;
    case 'shift-tab':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Key\\" -Namespace \\"Win32Utils\\" -PassThru; $type::keybd_event(0x10, 0, 0, 0); $type::keybd_event(0x09, 0, 0, 0); $type::keybd_event(0x09, 0, 2, 0); $type::keybd_event(0x10, 0, 2, 0)"`;
      break;
    case 'enter':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{ENTER}')"`;
      break;
    case 'escape':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{ESC}')"`;
      break;
    case 'page-up':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{PGUP}')"`;
      break;
    case 'page-down':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{PGDN}')"`;
      break;
    case 'zoom-in':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Key\\" -Namespace \\"Win32Utils\\" -PassThru; $type::keybd_event(0x11, 0, 0, 0); $type::keybd_event(0xBB, 0, 0, 0); $type::keybd_event(0xBB, 0, 2, 0); $type::keybd_event(0x11, 0, 2, 0)"`;
      break;
    case 'zoom-out':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Key\\" -Namespace \\"Win32Utils\\" -PassThru; $type::keybd_event(0x11, 0, 0, 0); $type::keybd_event(0xBD, 0, 0, 0); $type::keybd_event(0xBD, 0, 2, 0); $type::keybd_event(0x11, 0, 2, 0)"`;
      break;
    case 'zoom-reset':
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Key\\" -Namespace \\"Win32Utils\\" -PassThru; $type::keybd_event(0x11, 0, 0, 0); $type::keybd_event(0x30, 0, 0, 0); $type::keybd_event(0x30, 0, 2, 0); $type::keybd_event(0x11, 0, 2, 0)"`;
      break;
    case 'type':
      // Handled by type-text channel
      break;
    case 'backspace':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('{BACKSPACE}')"`;
      break;
    case 'space':
      command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys(' ')"`;
      break;
    default: return;
  }
  
  exec(command, (error) => {
    if (error) {
      console.error(`Navigation control error (${action}): ${error}`);
    }
  });
});

// Typing control
ipcMain.on('type-text', (event, text) => {
  console.log('IPC type-text', { length: text?.length });
  // Double escaping for PowerShell and handling slash/backslash
  const escaped = text
    .replace(/([+^%~(){}[\]])/g, '{$1}') // Escape SendKeys special chars
    .replace(/'/g, "''")                 // Escape PowerShell single quotes
    .replace(/\\/g, '\\\\');             // Escape backslashes for PowerShell string
  
  const command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys('${escaped}')"`;
  exec(command, (error) => {
    if (error) {
      console.error(`Typing error: ${error}`);
    }
  });
});

// Media control using PowerShell
ipcMain.on('media-control', (event, action) => {
  console.log('IPC media-control', { action });
  let charCode;
  switch (action) {
    case 'play-pause': charCode = 179; break; // VK_MEDIA_PLAY_PAUSE
    case 'next': charCode = 176; break;       // VK_MEDIA_NEXT_TRACK
    case 'previous': charCode = 177; break;   // VK_MEDIA_PREV_TRACK
    default: return;
  }
  
  const command = `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]${charCode})"`;
  exec(command, (error) => {
    if (error) {
      console.error(`Media control error (${action}): ${error}`);
    }
  });
});

// Volume control using PowerShell
ipcMain.on('change-volume', (event, direction) => {
  console.log('IPC change-volume', { direction });
  const command = direction === 'up' 
    ? `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]175)"` 
    : `powershell -Command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]174)"`;
  
  exec(command, (error) => {
    if (error) {
      console.error(`Volume change error: ${error}`);
    }
  });
});

// PIP Keyboard Window Management
function createKeyboardWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  keyboardWindow = new BrowserWindow({
    width: 600,
    height: 280,
    x: width - 620, // Bottom right
    y: height - 280,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false
  });

  const keyboardPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'app', 'keyboard.html')
    : path.join(process.cwd(), 'keyboard.html');
    
  keyboardWindow.loadFile(keyboardPath);
  
  keyboardWindow.on('closed', () => {
    keyboardWindow = null;
  });
}

ipcMain.on('toggle-keyboard', (event, show) => {
  console.log('IPC toggle-keyboard', { show });
  if (!keyboardWindow) {
    createKeyboardWindow();
  }

  if (show) {
    keyboardWindow.showInactive(); // Show without taking focus
  } else {
    keyboardWindow.hide();
  }
});

ipcMain.on('update-keyboard-selection', (event, selection) => {
  console.log('IPC update-keyboard-selection', { selection });
  if (keyboardWindow) {
    keyboardWindow.webContents.send('set-selection', selection);
  }
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  // Handle HID device selection
  mainWindow.webContents.session.on('select-hid-device', (event, details, callback) => {
    console.log('HID select device', { devices: details.deviceList?.length ?? 0 });
    event.preventDefault();
    if (details.deviceList && details.deviceList.length > 0) {
      // Auto-select the first Wii Remote if found
      const wiiRemote = details.deviceList.find(d => d.vendorId === 0x057e);
      if (wiiRemote) {
        console.log('HID selecting Wii Remote', { vendorId: wiiRemote.vendorId, productId: wiiRemote.productId, productName: wiiRemote.productName });
        callback(wiiRemote.deviceId);
      } else {
        console.log('HID selecting first device', { vendorId: details.deviceList[0]?.vendorId, productId: details.deviceList[0]?.productId, productName: details.deviceList[0]?.productName });
        callback(details.deviceList[0].deviceId);
      }
    } else {
      console.warn('HID no devices to select');
      callback(null);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    console.log('HID permission check', { permission });
    if (permission === 'hid') {
      return true;
    }
    return false;
  });

  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    console.log('HID device permission', { deviceType: details.deviceType, vendorId: details.device?.vendorId, productId: details.device?.productId, productName: details.device?.productName });
    // Grant permission to all Nintendo (0x057e) HID devices automatically
    if (details.deviceType === 'hid' && details.device.vendorId === 0x057e) {
      return true;
    }
    return false;
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    if (keyboardWindow) {
      keyboardWindow.close();
    }
  });
};

const getSyncLibraryPath = () => {
  const candidates = [
    path.join(process.cwd(), 'bin', 'Release', 'WiimoteSync.dll'),
    path.join(process.cwd(), 'WiimoteSync.dll'),
    path.join(app.getAppPath(), 'bin', 'Release', 'WiimoteSync.dll'),
    path.join(app.getAppPath(), 'WiimoteSync.dll'),
  ];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'WiimoteSync.dll'));
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const getSyncExecutablePath = () => {
  const candidates = [
    path.join(process.cwd(), 'bin', 'Release', 'WiimoteSync.exe'),
    path.join(process.cwd(), 'WiimoteSync.exe'),
    path.join(app.getAppPath(), 'bin', 'Release', 'WiimoteSync.exe'),
    path.join(app.getAppPath(), 'WiimoteSync.exe'),
  ];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'WiimoteSync.exe'));
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const runSyncExecutable = (mode) => new Promise((resolve) => {
  const exePath = getSyncExecutablePath();
  if (exePath) {
    const args = [];
    if (mode === 'guest') args.push('guest');
    if (mode === 'bond') args.push('bond');
    const child = spawn(exePath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      console.error('WiimoteSync.exe error:', error.message);
      resolve({ ok: false, code: null, error: error.message, stdout, stderr });
    });
    child.on('close', (code) => {
      if (stdout.trim()) console.log('WiimoteSync.exe stdout:\n', stdout.trim());
      if (stderr.trim()) console.warn('WiimoteSync.exe stderr:\n', stderr.trim());
      resolve({ ok: code === 0, code, stdout, stderr });
    });
    return;
  }
  const dllPath = getSyncLibraryPath();
  if (!dllPath) {
    resolve({ ok: false, code: null, error: 'WiimoteSync.exe not found' });
    return;
  }
  const child = spawn('rundll32.exe', [`${dllPath},SyncWiimote`], { windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (data) => {
    stdout += data.toString();
  });
  child.stderr?.on('data', (data) => {
    stderr += data.toString();
  });
  child.on('error', (error) => {
    console.error('WiimoteSync.dll error:', error.message);
    resolve({ ok: false, code: null, error: error.message, stdout, stderr });
  });
  child.on('close', (code) => {
    if (stdout.trim()) console.log('WiimoteSync.dll stdout:\n', stdout.trim());
    if (stderr.trim()) console.warn('WiimoteSync.dll stderr:\n', stderr.trim());
    resolve({ ok: code === 0, code, stdout, stderr });
  });
});

app.whenReady().then(() => {
  startMouseWorker();
  createWindow();
  ipcMain.handle('sync-wiimote', async (_e, mode) => runSyncExecutable(mode));

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
