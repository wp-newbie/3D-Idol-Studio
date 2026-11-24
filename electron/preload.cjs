const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  isElectron: true,
  setRoamOverlay: (enabled) =>
    ipcRenderer.invoke('desktop:setRoamOverlay', Boolean(enabled)),
  setClickThrough: (ignore, forward = true) =>
    ipcRenderer.send('desktop:setClickThrough', Boolean(ignore), Boolean(forward)),
  getActiveWindowTitle: () =>
    ipcRenderer.invoke('desktop:getActiveWindowTitle'),
  readApiKey: () => ipcRenderer.invoke('desktop:readApiConfig'),
  saveApiKey: (apiKey) => ipcRenderer.invoke('desktop:writeApiConfig', apiKey),
});

contextBridge.exposeInMainWorld('studioAPI', {
  isElectron: true,
  readState: () => ipcRenderer.invoke('studio:readState'),
  writeState: (payload) => ipcRenderer.invoke('studio:writeState', payload),
  getStorageInfo: () => ipcRenderer.invoke('studio:getStorageInfo'),
  exportJson: (defaultName, jsonText) =>
    ipcRenderer.invoke('studio:exportJson', defaultName, jsonText),
  readLocalEnvKey: () => ipcRenderer.invoke('studio:readLocalEnvKey'),
  setDesktopRoamMode: (enabled) =>
    ipcRenderer.invoke('desktop:setRoamOverlay', Boolean(enabled)),
  setIgnoreMouseEvents: (ignore, forward = true) =>
    ipcRenderer.send('desktop:setClickThrough', Boolean(ignore), Boolean(forward)),
  getActiveWindowTitle: () => ipcRenderer.invoke('desktop:getActiveWindowTitle'),
  getSystemIdleAndFullscreenState: () =>
    ipcRenderer.invoke('studio:getSystemIdleAndFullscreenState'),
  revealOverlayForCheckIn: () => ipcRenderer.send('studio:revealOverlayForCheckIn'),
  windowControl: (action) => ipcRenderer.send('studio:windowControl', action),
});
