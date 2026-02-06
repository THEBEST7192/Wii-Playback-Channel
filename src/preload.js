import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('system', {
  syncWiimote: (mode) => ipcRenderer.invoke('sync-wiimote', mode),
});
