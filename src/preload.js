import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('system', {
  syncWiimote: (mode) => ipcRenderer.invoke('sync-wiimote', mode),
  changeVolume: (direction) => ipcRenderer.send('change-volume', direction),
  mediaControl: (action) => ipcRenderer.send('media-control', action),
  navControl: (action) => ipcRenderer.send('nav-control', action),
});
