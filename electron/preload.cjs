const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  isElectron: true,
  setRoamOverlay: (enabled, targetDisplay) =>
    ipcRenderer.invoke('desktop:setRoamOverlay', Boolean(enabled), targetDisplay),
  setClickThrough: (ignore, forward = true) =>
    ipcRenderer.send('desktop:setClickThrough', Boolean(ignore), Boolean(forward)),
  getActiveWindowTitle: () =>
    ipcRenderer.invoke('desktop:getActiveWindowTitle'),
  getDisplays: () =>
    ipcRenderer.invoke('desktop:getDisplays'),
  moveToDisplay: (targetDisplay) =>
    ipcRenderer.invoke('desktop:moveToDisplay', targetDisplay),
  readApiKey: () => ipcRenderer.invoke('desktop:readApiConfig'),
  saveApiKey: (apiKey) => ipcRenderer.invoke('desktop:writeApiConfig', apiKey),
  captureScreen: () => ipcRenderer.invoke('desktop:captureScreen'),
  fetchJapaneseTts: (spokenText) =>
    ipcRenderer.invoke('studio:fetchJapaneseTts', spokenText),
  requestGeminiTts: (params) =>
    ipcRenderer.invoke('studio:requestGeminiTts', params),
  getDesktopSnapshot: () => ipcRenderer.invoke('desktop:getDesktopSnapshot'),
  fetchImage: (url) => ipcRenderer.invoke('desktop:fetchImage', url),
  listRunningApps: (filter) => ipcRenderer.invoke('desktop:listRunningApps', filter),
  launchApp: (target, args) => ipcRenderer.invoke('desktop:launchApp', target, args),
  closeApp: (appNameOrPid) => ipcRenderer.invoke('desktop:closeApp', appNameOrPid),
  focusApp: (appNameOrPid) => ipcRenderer.invoke('desktop:focusApp', appNameOrPid),
  checkLocalAi: () => ipcRenderer.invoke('studio:checkLocalAi'),
  queryLocalAi: (params) => ipcRenderer.invoke('studio:queryLocalAi', params),
  synthesizeVoicevox: (params) => ipcRenderer.invoke('studio:synthesizeVoicevox', params),
  transcribeAudio: (params) => ipcRenderer.invoke('studio:transcribeAudio', params),
});

contextBridge.exposeInMainWorld('studioAPI', {
  isElectron: true,
  readState: () => ipcRenderer.invoke('studio:readState'),
  writeState: (payload) => ipcRenderer.invoke('studio:writeState', payload),
  getStorageInfo: () => ipcRenderer.invoke('studio:getStorageInfo'),
  exportJson: (defaultName, jsonText) =>
    ipcRenderer.invoke('studio:exportJson', defaultName, jsonText),
  readLocalEnvKey: () => ipcRenderer.invoke('studio:readLocalEnvKey'),
  setDesktopRoamMode: (enabled, targetDisplay) =>
    ipcRenderer.invoke('desktop:setRoamOverlay', Boolean(enabled), targetDisplay),
  getDisplays: () =>
    ipcRenderer.invoke('studio:getDisplays'),
  moveToDisplay: (targetDisplay) =>
    ipcRenderer.invoke('studio:moveToDisplay', targetDisplay),
  setIgnoreMouseEvents: (ignore, forward = true) =>
    ipcRenderer.send('desktop:setClickThrough', Boolean(ignore), Boolean(forward)),
  getActiveWindowTitle: () => ipcRenderer.invoke('desktop:getActiveWindowTitle'),
  getSystemIdleAndFullscreenState: () =>
    ipcRenderer.invoke('studio:getSystemIdleAndFullscreenState'),
  revealOverlayForCheckIn: () => ipcRenderer.send('studio:revealOverlayForCheckIn'),
  windowControl: (action) => ipcRenderer.send('studio:windowControl', action),
  captureScreen: () => ipcRenderer.invoke('desktop:captureScreen'),
  fetchJapaneseTts: (spokenText) =>
    ipcRenderer.invoke('studio:fetchJapaneseTts', spokenText),
  requestGeminiTts: (params) =>
    ipcRenderer.invoke('studio:requestGeminiTts', params),
  getDesktopSnapshot: () => ipcRenderer.invoke('desktop:getDesktopSnapshot'),
  fetchImage: (url) => ipcRenderer.invoke('desktop:fetchImage', url),
  listRunningApps: (filter) => ipcRenderer.invoke('desktop:listRunningApps', filter),
  launchApp: (target, args) => ipcRenderer.invoke('desktop:launchApp', target, args),
  closeApp: (appNameOrPid) => ipcRenderer.invoke('desktop:closeApp', appNameOrPid),
  focusApp: (appNameOrPid) => ipcRenderer.invoke('desktop:focusApp', appNameOrPid),
  checkLocalAi: () => ipcRenderer.invoke('studio:checkLocalAi'),
  queryLocalAi: (params) => ipcRenderer.invoke('studio:queryLocalAi', params),
  synthesizeVoicevox: (params) => ipcRenderer.invoke('studio:synthesizeVoicevox', params),
  transcribeAudio: (params) => ipcRenderer.invoke('studio:transcribeAudio', params),
});
