import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, exec } from 'node:child_process';
import started from 'electron-squirrel-startup';

let mainWindow;
let keyboardWindow;

// Navigation control using PowerShell
ipcMain.on('nav-control', (event, action) => {
  let command;
  switch (action) {
    case 'click':
      // Left click using mouse_event (0x02 = left down, 0x04 = left up)
      command = `powershell -Command "$sig = '[DllImport(\\"user32.dll\\")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);'; $type = Add-Type -MemberDefinition $sig -Name \\"Win32Mouse\\" -Namespace \\"Win32Utils\\" -PassThru; $type::mouse_event(0x0002, 0, 0, 0, 0); $type::mouse_event(0x0004, 0, 0, 0, 0)"`;
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

  keyboardWindow.loadFile(path.join(process.cwd(), 'keyboard.html'));
  
  keyboardWindow.on('closed', () => {
    keyboardWindow = null;
  });
}

ipcMain.on('toggle-keyboard', (event, show) => {
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
    event.preventDefault();
    if (details.deviceList && details.deviceList.length > 0) {
      // Auto-select the first Wii Remote if found
      const wiiRemote = details.deviceList.find(d => d.vendorId === 0x057e);
      if (wiiRemote) {
        callback(wiiRemote.deviceId);
      } else {
        callback(details.deviceList[0].deviceId);
      }
    } else {
      callback(null);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'hid') {
      return true;
    }
    return false;
  });

  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
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
