# Wii Playback Channel

## Requirements (Windows + MSYS2 MinGW64)
- Windows 10/11
- MSYS2 MinGW64 shell

## Navigate to the Project Directory
Open the **MSYS2 MinGW64** shell and navigate to the project directory:

```bash
cd /c
cd /path/to/Wii-Playback-Channel
# For example: `cd /c/Users/Administrator/Downloads/Wii-Playback-Channel`
```

## Install Toolchain (MSYS2 MinGW64)
Open the **MSYS2 MinGW64** shell and run (when prompted for the toolchain group, press Enter to install all members):

```bash
pacman -S --needed mingw-w64-x86_64-toolchain mingw-w64-x86_64-cmake mingw-w64-x86_64-ninja
```
+ Node as that is easier than switching between PowerShell and MSYS2 MinGW64:
```bash
pacman -S mingw-w64-x86_64-nodejs
```

## Build the Sync Helper CLI
From the project root in **MSYS2 MinGW64**:

```bash
cmake -S . -B build -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

Copy the CLI and DLL to one of the locations the app scans:

```bash
mkdir -p bin/Release
cp build/WiimoteSync.exe bin/Release/WiimoteSync.exe
cp build/libWiimoteSync.dll bin/Release/WiimoteSync.dll
cp /mingw64/bin/libstdc++-6.dll bin/Release/
cp /mingw64/bin/libgcc_s_seh-1.dll bin/Release/
cp /mingw64/bin/libwinpthread-1.dll bin/Release/
```

## Run the App
From PowerShell:

```powershell
npm install
npm run start
```

## Pairing Flow (No Dolphin Required)
1. Press **1 + 2** on the Wii Remote.
2. Click **Sync Wii Remote** in the app.
3. Click **Connect Wii Remote** to start using it.
