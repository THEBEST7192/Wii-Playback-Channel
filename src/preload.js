import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('system', {
  syncWiimote: (mode) => ipcRenderer.invoke('sync-wiimote', mode),
  changeVolume: (direction) => ipcRenderer.send('change-volume', direction),
  mediaControl: (action) => ipcRenderer.send('media-control', action),
  navControl: (action) => ipcRenderer.send('nav-control', action),
  typeText: (text) => ipcRenderer.send('type-text', text),
  toggleKeyboard: (show) => ipcRenderer.send('toggle-keyboard', show),
  updateKeyboardSelection: (selection) => ipcRenderer.send('update-keyboard-selection', selection),
  xinputToggle: (enabled) => ipcRenderer.invoke('xinput-toggle', enabled),
  xinputUpdate: (state) => ipcRenderer.send('xinput-update', state),
});
