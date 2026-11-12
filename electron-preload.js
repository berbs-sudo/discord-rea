// ============================================================================
// electron-preload.js
// Recria a ponte DiscordNative de mainScreenPreload.js (core.asar)
// extraída via morluto/rea (Evidence ID: ev_b81e2a5f2aa2bbbb5c2aacc7e06c26870c64a0a97b39cbf2cf231bf7d342f619)
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('DiscordNative', {
  isRenderer: true,
  isDesktopApp: true,
  app: {
    getVersion: () => '1.0.9262-rea',
    getReleaseChannel: () => 'stable'
  },
  desktopCapturer: {
    getSources: () => ipcRenderer.invoke('discord-native:get-desktop-sources'),
    selectSource: (sourceId, includeAudio = true) =>
      ipcRenderer.invoke('discord-native:select-desktop-source', { sourceId, includeAudio })
  },
  remoteServer: {
    connectToHost: (codeOrUrl) => ipcRenderer.invoke('discord-native:connect-host', { codeOrUrl }),
    connectToLocal: () => ipcRenderer.invoke('discord-native:connect-local'),
    getStatus: () => ipcRenderer.invoke('discord-native:get-host-status')
  },
  windowControls: {
    minimize: () => ipcRenderer.send('discord-native:window-minimize'),
    maximize: () => ipcRenderer.send('discord-native:window-maximize'),
    close: () => ipcRenderer.send('discord-native:window-close')
  },
  onGlobalShortcut: (callback) => {
    ipcRenderer.on('discord-native:shortcut', (_event, action) => {
      if (typeof callback === 'function') callback(action);
    });
  }
});

