import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, exec } from 'node:child_process';
import started from 'electron-squirrel-startup';

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

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();
  ipcMain.handle('sync-wiimote', async (_e, mode) => runSyncExecutable(mode));

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
