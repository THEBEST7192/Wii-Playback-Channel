# Wii Playback Channel

## Requirements
- Windows 10/11
- Install VSSetup module for PowerShell using "Install-Module VSSetup -Scope AllUsers" for more details see https://github.com/microsoft/vssetup.powershell
- Install Visual Studio 2022 Build Tools using chocolatey "choco install visualstudio2022buildtools -y"
- Install visual studio 2022 workloads using chocolatey "choco install visualstudio2022-workload-vctools -y" see https://github.com/nodejs/node-gyp#on-windows for more details  
- Install Python 3.12 using chocolatey "choco install python --version 3.12.10 --force" deretter "C:\Python312\python.exe -m pip install setuptools"
- Global install node-gyp using "npm install -g node-gyp"
- Node.js

## Build and Setup

### 1. Build Native Components
The app uses a native C++ helper for Wii Remote synchronization. This is automatically handled during packaging, but can be built manually using the provided script:

```powershell
# From PowerShell (requires Visual Studio installed)
.\build_msvc.bat
```

### 2. Run the App
```powershell
npm install
npm run start
```

### 3. Create Distributables
To package the app for distribution:

```powershell
# This will automatically build native components and package the app
npm run make
```

The packaged app will be available in the `out/` folder. Note that ASAR is disabled to ensure consistent performance with the native binaries.

## Pairing Flow (No Dolphin Required)
1. Press **1 + 2** on the Wii Remote (LEDs should blink).
2. Click **Sync Wii Remote** in the app.
3. Click **Connect Wii Remote** once the LEDs stop blinking to start using it.

## Technical Details
- **Sync Helper**: Built with MSVC and uses standard Windows Bluetooth APIs.
- **Packaging**: Uses Electron Forge with custom whitelisting for `.vite` and `bin/Release` assets.
- **Auto-Sync**: The app will automatically attempt to connect to already paired Wii Remotes on startup.
