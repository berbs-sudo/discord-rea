// ============================================================================
// electron-main.js
// Processo Principal Electron do Discord REA (.EXE Instalável & Portátil)
// Suporta:
// 1. Servidor local embutido + Túnel Público HTTPS automático (Host)
// 2. Conexão direta à Sala/Servidor de qualquer amigo (Cliente Multi-Rede)
//    com bypass automático de tela de senha do LocalTunnel (Bypass-Tunnel-Reminder)
// 3. Captura nativa de Telas e Janelas com miniaturas + Áudio Loopback do Windows
// 4. Bandeja do Sistema (System Tray) e Atalhos Globais (Ctrl+Shift+M / Ctrl+Shift+D)
// ============================================================================

const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  Tray,
  Menu,
  globalShortcut,
  shell
} = require('electron');
const path = require('path');

// Configure writable data directory in %APPDATA%\Discord-REA before loading server.js
process.env.DISCORD_REA_DATA_DIR = app.getPath('userData');

const { startDiscordServer, getNetworkInfo } = require('./server.js');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let localPort = 3000;
let currentTargetMode = 'local'; // 'local' | 'remote'
let currentTargetUrl = 'http://localhost:3000';
let selectedDesktopSourceId = null;
let selectedIncludeAudio = true;

function normalizeHostInput(rawInput) {
  let str = String(rawInput || '').trim();
  if (!str) return `http://localhost:${localPort}`;

  // Extract invite code if pasted with ?invite=
  let inviteQuery = '';
  const qIdx = str.indexOf('?');
  if (qIdx >= 0) {
    inviteQuery = str.slice(qIdx);
    str = str.slice(0, qIdx);
  }
  str = str.replace(/\/+$/, '');

  // If user entered a short room code like "rich-hats-hope", expand to https://rich-hats-hope.loca.lt
  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    if (str.includes('.trycloudflare.com') || str.includes('.loca.lt') || str.includes('.ngrok')) {
      str = `https://${str}`;
    } else if (/^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(str) || str.startsWith('localhost')) {
      str = `http://${str.includes(':') ? str : `${str}:3000`}`;
    } else {
      str = `https://${str.toLowerCase().replace(/[^a-z0-9-]/g, '')}.loca.lt`;
    }
  }
  return str + inviteQuery;
}

function setupSessionPermissionsAndScreenCapture() {
  const ses = session.defaultSession;

  // Inject Bypass-Tunnel-Reminder header on all requests so friends using the .EXE
  // NEVER get blocked by LocalTunnel's browser reminder/password page!
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Bypass-Tunnel-Reminder'] = 'true';
    details.requestHeaders['ngrok-skip-browser-warning'] = 'true';
    callback({ requestHeaders: details.requestHeaders });
  });

  // Automatically grant Microphone, Camera, Screen Capture & Notifications permissions
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'display-capture', 'mediaKeySystem', 'notifications', 'fullscreen', 'clipboard-read'];
    callback(allowed.includes(permission));
  });

  ses.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'display-capture', 'mediaKeySystem', 'notifications', 'fullscreen'];
    return allowed.includes(permission);
  });

  // Native Electron Screen & Window Capture Handler with Windows System Audio Loopback
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window']
      });
      if (!sources || sources.length === 0) {
        return callback({});
      }

      const chosen =
        (selectedDesktopSourceId && sources.find(s => s.id === selectedDesktopSourceId)) ||
        sources[0];

      selectedDesktopSourceId = null;

      const response = { video: chosen };
      if (selectedIncludeAudio && process.platform === 'win32') {
        response.audio = 'loopback';
      }
      callback(response);
    } catch (err) {
      console.error('Erro no setDisplayMediaRequestHandler:', err);
      callback({});
    }
  });
}

function createMainWindow() {
  const iconPath = path.join(__dirname, 'build', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    title: 'Discord (REA Desktop)',
    icon: iconPath,
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // Allows seamless WebRTC / Socket.IO / media connections across local and tunnel origins
    }
  });

  mainWindow.loadURL(currentTargetUrl);

  // Open external links in the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('newSession=1') || url.startsWith(`http://localhost:${localPort}`)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1200,
          height: 800,
          autoHideMenuBar: true,
          webPreferences: {
            preload: path.join(__dirname, 'electron-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false
          }
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createSystemTray() {
  try {
    const iconPath = path.join(__dirname, 'build', 'icon.ico');
    tray = new Tray(iconPath);
    tray.setToolTip('Discord REA — Voz, Vídeo & Compartilhamento de Tela');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir Discord REA',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Voltar para Meu Servidor Local (Host)',
        click: () => {
          currentTargetMode = 'local';
          currentTargetUrl = `http://localhost:${localPort}`;
          mainWindow?.loadURL(currentTargetUrl);
          mainWindow?.show();
        }
      },
      { type: 'separator' },
      {
        label: 'Silenciar / Ativar Microfone (Ctrl+Shift+M)',
        click: () => mainWindow?.webContents.send('discord-native:shortcut', 'toggle-mute')
      },
      {
        label: 'Desativar / Ativar Áudio (Ctrl+Shift+D)',
        click: () => mainWindow?.webContents.send('discord-native:shortcut', 'toggle-deaf')
      },
      { type: 'separator' },
      {
        label: 'Sair do Discord REA',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) mainWindow.focus();
        else mainWindow.show();
      }
    });
  } catch (err) {
    console.warn('Tray creation skipped:', err.message);
  }
}

// IPC Handlers for DiscordNative Bridge
ipcMain.handle('discord-native:get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnailDataUrl: s.thumbnail ? s.thumbnail.toDataURL() : '',
      appIconDataUrl: s.appIcon ? s.appIcon.toDataURL() : ''
    }));
  } catch (err) {
    console.error('Erro ao listar fontes desktopCapturer:', err);
    return [];
  }
});

ipcMain.handle('discord-native:select-desktop-source', (_event, { sourceId, includeAudio }) => {
  selectedDesktopSourceId = sourceId || null;
  selectedIncludeAudio = includeAudio !== false;
  return { ok: true };
});

ipcMain.handle('discord-native:connect-host', async (_event, { codeOrUrl }) => {
  const targetUrl = normalizeHostInput(codeOrUrl);
  currentTargetMode = 'remote';
  currentTargetUrl = targetUrl;
  if (mainWindow) {
    await mainWindow.loadURL(targetUrl);
  }
  return { mode: currentTargetMode, url: currentTargetUrl };
});

ipcMain.handle('discord-native:connect-local', async () => {
  currentTargetMode = 'local';
  currentTargetUrl = `http://localhost:${localPort}`;
  if (mainWindow) {
    await mainWindow.loadURL(currentTargetUrl);
  }
  return { mode: currentTargetMode, url: currentTargetUrl };
});

ipcMain.handle('discord-native:get-host-status', () => {
  const net = getNetworkInfo();
  return {
    mode: currentTargetMode,
    currentUrl: currentTargetUrl,
    localUrl: `http://localhost:${localPort}`,
    localTunnelUrl: net?.tunnel?.url || null,
    localRoomCode: net?.tunnel?.roomCode || null
  };
});

ipcMain.on('discord-native:window-minimize', () => mainWindow?.minimize());
ipcMain.on('discord-native:window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('discord-native:window-close', () => mainWindow?.close());

app.whenReady().then(async () => {
  const srvInfo = await startDiscordServer(3000);
  localPort = srvInfo.port || 3000;
  currentTargetUrl = `http://localhost:${localPort}`;

  setupSessionPermissionsAndScreenCapture();
  createMainWindow();
  createSystemTray();

  // Register global gaming shortcuts
  try {
    globalShortcut.register('CommandOrControl+Shift+M', () => {
      mainWindow?.webContents.send('discord-native:shortcut', 'toggle-mute');
    });
    globalShortcut.register('CommandOrControl+Shift+D', () => {
      mainWindow?.webContents.send('discord-native:shortcut', 'toggle-deaf');
    });
  } catch (_e) {}
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

