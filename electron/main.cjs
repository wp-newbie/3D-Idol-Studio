const { app, BrowserWindow, ipcMain, dialog, screen, powerMonitor, session } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// Unlock Chromium autoplay so Gemini TTS and proactive voice check-ins never stall in Electron
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const STATE_FILE = () => path.join(app.getPath('userData'), 'zeta-studio-state.json');
const API_CONFIG_FILE = () => path.join(app.getPath('userData'), 'api-config.json');

let mainWindow = null;
let normalStudioBounds = null;
let isRoamOverlayActive = false;

function parseEnvFileForKey(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = /^(?:VITE_GEMINI_API_KEY|GEMINI_API_KEY|API_KEY)\s*=\s*(.+)$/.exec(line);
      if (match) {
        const val = match[1].trim().replace(/^["']|["']$/g, '');
        if (val) return val;
      }
    }
  } catch {
    // ignore
  }
  return '';
}

function readLocalEnvApiKey() {
  const fromProc =
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.API_KEY ||
    '';
  if (fromProc.trim()) return { key: fromProc.trim(), source: 'process.env' };

  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(app.getAppPath(), '.env'),
    path.join(path.dirname(app.getPath('exe')), '.env'),
    path.join(app.getPath('userData'), '.env'),
  ];
  for (const candidate of candidates) {
    const found = parseEnvFileForKey(candidate);
    if (found) return { key: found, source: `.env (${path.basename(path.dirname(candidate))})` };
  }
  return { key: '', source: 'none' };
}

/**
 * Strictly local, privacy-safe active foreground window title reader (Windows PowerShell Win32 P/Invoke).
 * Only invoked when the user explicitly opts in to "Notice Active Window (👁️)".
 */
function readActiveForegroundWindowTitle() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(null);
      return;
    }
    const psScript = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'using System.Text;',
      'public class WinFocus {',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);',
      '}',
      '"@;',
      '$h = [WinFocus]::GetForegroundWindow();',
      '$sb = New-Object System.Text.StringBuilder 256;',
      '[void][WinFocus]::GetWindowText($h, $sb, $sb.Capacity);',
      'Write-Output $sb.ToString();',
    ].join(' ');

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { timeout: 3500 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const title = String(stdout || '').trim();
        if (!title || /zeta 3d idol studio/i.test(title)) {
          resolve(null);
          return;
        }
        // Distill privacy-safe app name (avoid exposing full file paths)
        if (/visual studio code/i.test(title)) return resolve('VS Code');
        if (/youtube/i.test(title)) return resolve('YouTube');
        if (/discord/i.test(title)) return resolve('Discord');
        if (/spotify/i.test(title)) return resolve('Spotify');
        if (/aion\s*2/i.test(title)) return resolve('Playing Aion 2');
        if (/genshin|honkai|valorant|elden ring|steam/i.test(title)) {
          const gamePart = title.split(' - ')[0].trim();
          return resolve(`Playing ${gamePart.slice(0, 40)}`);
        }
        const shortApp = title.split(' - ').pop()?.trim() || title;
        resolve(shortApp.slice(0, 48));
      }
    );
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    title: 'Zeta 3D Idol Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('studio:readState', async () => {
  try {
    const filePath = STATE_FILE();
    if (!fs.existsSync(filePath)) return null;
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Electron] Failed to read studio state:', err);
    return null;
  }
});

ipcMain.handle('studio:writeState', async (_event, payload) => {
  try {
    const filePath = STATE_FILE();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('[Electron] Failed to write studio state:', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('studio:getStorageInfo', async () => {
  const filePath = STATE_FILE();
  const exists = fs.existsSync(filePath);
  const size = exists ? fs.statSync(filePath).size : 0;
  return {
    isElectron: true,
    userDataPath: app.getPath('userData'),
    stateFilePath: filePath,
    stateFileBytes: size,
  };
});

ipcMain.handle('studio:readLocalEnvKey', async () => {
  return readLocalEnvApiKey();
});

ipcMain.handle('desktop:readApiConfig', async () => {
  try {
    const filePath = API_CONFIG_FILE();
    if (!fs.existsSync(filePath)) return { apiKey: '' };
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const key = typeof parsed?.apiKey === 'string' ? parsed.apiKey.trim().replace(/^["']|["']$/g, '').trim() : '';
    return { apiKey: /•/.test(key) ? '' : key };
  } catch (err) {
    console.error('[Electron] Failed to read api-config.json:', err);
    return { apiKey: '' };
  }
});

ipcMain.handle('desktop:writeApiConfig', async (_event, apiKey) => {
  try {
    const filePath = API_CONFIG_FILE();
    const cleaned =
      typeof apiKey === 'string'
        ? apiKey.trim().replace(/^["']|["']$/g, '').trim()
        : '';
    if (/•/.test(cleaned)) {
      return { ok: false, error: 'Refused to persist masked API key' };
    }
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(
      filePath,
      JSON.stringify({ apiKey: cleaned, updatedAt: Date.now() }, null, 2),
      'utf-8'
    );
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('[Electron] Failed to write api-config.json:', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('studio:exportJson', async (_event, defaultName, jsonText) => {
  const result = await dialog.showSaveDialog({
    title: 'Export Persona JSON',
    defaultPath: defaultName,
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  await fs.promises.writeFile(result.filePath, jsonText, 'utf-8');
  return { ok: true, filePath: result.filePath };
});

// === Desktop Mascot / Borderless Transparent Widget Overlay Mode IPC ===

async function handleSetRoamOverlay(enabled) {
  if (!mainWindow) return { ok: false };
  isRoamOverlayActive = Boolean(enabled);

  if (isRoamOverlayActive) {
    normalStudioBounds = mainWindow.getBounds();
    const display = screen.getPrimaryDisplay();
    const workArea = display.workArea;
    mainWindow.setSkipTaskbar(true);
    mainWindow.setResizable(false);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setBounds({
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
    });
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.setVisibleOnAllWorkspaces(false);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setSkipTaskbar(false);
    mainWindow.setResizable(true);
    if (normalStudioBounds) {
      mainWindow.setBounds(normalStudioBounds);
    } else {
      mainWindow.setSize(1520, 920);
      mainWindow.center();
    }
  }
  return { ok: true, enabled: isRoamOverlayActive };
}

function handleSetClickThrough(ignore, forward) {
  if (!mainWindow || !isRoamOverlayActive) return;
  if (ignore) {
    mainWindow.setIgnoreMouseEvents(true, { forward: forward !== false });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
}

ipcMain.handle('desktop:setRoamOverlay', async (_event, enabled) => handleSetRoamOverlay(enabled));
ipcMain.handle('studio:setDesktopRoamMode', async (_event, enabled) => handleSetRoamOverlay(enabled));

ipcMain.on('desktop:setClickThrough', (_event, ignore, forward) => handleSetClickThrough(ignore, forward));
ipcMain.on('studio:setIgnoreMouseEvents', (_event, ignore, forward) => handleSetClickThrough(ignore, forward));

ipcMain.handle('desktop:getActiveWindowTitle', async () => {
  const appName = await readActiveForegroundWindowTitle();
  return { appName };
});

/**
 * Detects whether a third-party app (e.g. a fullscreen game or video player) is currently
 * occupying the entire display so Proactive Idle Check-Ins respect Do-Not-Disturb / gaming.
 */
function checkIsFullscreenAppActive() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false);
      return;
    }
    const psScript = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'using System.Text;',
      'public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
      'public class WinFS {',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);',
      '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);',
      '  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);',
      '}',
      '"@;',
      '$h = [WinFS]::GetForegroundWindow();',
      '$sb = New-Object System.Text.StringBuilder 256;',
      '[void][WinFS]::GetWindowText($h, $sb, $sb.Capacity);',
      '$t = $sb.ToString();',
      'if (-not $t -or $t -match "Zeta 3D Idol Studio|Program Manager") { Write-Output "false"; exit }',
      '$r = New-Object RECT;',
      '[void][WinFS]::GetWindowRect($h, [ref]$r);',
      '$sw = [WinFS]::GetSystemMetrics(0);',
      '$sh = [WinFS]::GetSystemMetrics(1);',
      '$isFs = ($r.Left -le 0 -and $r.Top -le 0 -and ($r.Right - $r.Left) -ge $sw -and ($r.Bottom - $r.Top) -ge $sh);',
      'if ($isFs) { Write-Output "true" } else { Write-Output "false" }',
    ].join(' ');

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { timeout: 3000 },
      (err, stdout) => {
        if (err) return resolve(false);
        resolve(String(stdout || '').trim().toLowerCase() === 'true');
      }
    );
  });
}

ipcMain.handle('studio:getActiveWindowTitle', async () => {
  const appName = await readActiveForegroundWindowTitle();
  return { appName };
});

ipcMain.handle('studio:getSystemIdleAndFullscreenState', async () => {
  const idleSeconds = powerMonitor.getSystemIdleTime();
  const isFullscreenApp = await checkIsFullscreenAppActive();
  return { idleSeconds, isFullscreenApp };
});

ipcMain.on('studio:revealOverlayForCheckIn', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.showInactive();
});

ipcMain.on('studio:windowControl', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  } else if (action === 'close') mainWindow.close();
});

app.whenReady().then(() => {
  // Allow audio/media permissions without blocking voice playback or microphone capture
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = new Set([
      'media',
      'audioCapture',
      'mediaKeySystem',
      'notifications',
      'speaker-selection',
    ]);
    callback(allowedPermissions.has(permission));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
