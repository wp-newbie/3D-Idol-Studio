const { app, BrowserWindow, ipcMain, dialog, screen, powerMonitor, session, desktopCapturer } = require('electron');
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
  // Allow CORS for local offline AI engines (LM Studio :1234, VOICEVOX :50021)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isLocalRequest =
      details.url.includes('127.0.0.1') ||
      details.url.includes('localhost');
    if (isLocalRequest) {
      const responseHeaders = { ...(details.responseHeaders || {}) };
      responseHeaders['access-control-allow-origin'] = ['*'];
      responseHeaders['access-control-allow-headers'] = ['*'];
      responseHeaders['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
      callback({ responseHeaders });
      return;
    }
    callback({ responseHeaders: details.responseHeaders });
  });

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

let currentRoamDisplayTarget = null; // null | number (display.id) | 'all'

function getRoamDisplays() {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const prim = screen.getPrimaryDisplay();
  return displays.map((d, index) => {
    let positionHint = '';
    if (d.id !== prim.id) {
      if (d.bounds.x < prim.bounds.x) positionHint = ' (Left Screen)';
      else if (d.bounds.x > prim.bounds.x) positionHint = ' (Right Screen)';
      else if (d.bounds.y < prim.bounds.y) positionHint = ' (Top Screen)';
      else if (d.bounds.y > prim.bounds.y) positionHint = ' (Bottom Screen)';
    }
    return {
      id: d.id,
      index,
      label: `Display ${index + 1}${d.id === primaryId ? ' (Primary)' : positionHint}`,
      isPrimary: d.id === primaryId,
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
    };
  });
}

function getRoamTargetBounds(targetDisplay) {
  const displays = screen.getAllDisplays();
  if (displays.length === 0) return { x: 0, y: 0, width: 1920, height: 1080 };

  if (targetDisplay === 'all') {
    let minX = displays[0].bounds.x;
    let minY = displays[0].bounds.y;
    let maxX = displays[0].bounds.x + displays[0].bounds.width;
    let maxY = displays[0].bounds.y + displays[0].bounds.height;
    for (let i = 1; i < displays.length; i++) {
      const b = displays[i].bounds;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  let selected = null;
  if (typeof targetDisplay === 'number') {
    selected = displays.find((d) => d.id === targetDisplay) || displays[targetDisplay];
  } else if (typeof targetDisplay === 'string' && targetDisplay !== 'primary') {
    const parsed = parseInt(targetDisplay, 10);
    if (!isNaN(parsed)) {
      selected = displays.find((d) => d.id === parsed) || displays[parsed];
    }
    if (!selected) {
      selected = displays.find((d) => String(d.id) === targetDisplay);
    }
  }
  if (!selected) {
    selected = screen.getPrimaryDisplay();
  }
  return selected.workArea;
}

async function handleSetRoamOverlay(enabled, targetDisplay) {
  if (!mainWindow) return { ok: false };
  isRoamOverlayActive = Boolean(enabled);

  if (isRoamOverlayActive) {
    if (!normalStudioBounds) {
      normalStudioBounds = mainWindow.getBounds();
    }
    if (targetDisplay !== undefined) {
      currentRoamDisplayTarget = targetDisplay;
    }
    const bounds = getRoamTargetBounds(currentRoamDisplayTarget);
    mainWindow.setSkipTaskbar(true);
    mainWindow.setResizable(false);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    currentRoamDisplayTarget = null;
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
  return {
    ok: true,
    enabled: isRoamOverlayActive,
    currentDisplay: currentRoamDisplayTarget,
    displays: getRoamDisplays(),
  };
}

function handleSetClickThrough(ignore, forward) {
  if (!mainWindow || !isRoamOverlayActive) return;
  if (ignore) {
    mainWindow.setIgnoreMouseEvents(true, { forward: forward !== false });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
}

ipcMain.handle('desktop:setRoamOverlay', async (_event, enabled, targetDisplay) =>
  handleSetRoamOverlay(enabled, targetDisplay)
);
ipcMain.handle('studio:setDesktopRoamMode', async (_event, enabled, targetDisplay) =>
  handleSetRoamOverlay(enabled, targetDisplay)
);

ipcMain.handle('desktop:getDisplays', async () => ({
  displays: getRoamDisplays(),
  currentDisplayId: currentRoamDisplayTarget,
}));
ipcMain.handle('studio:getDisplays', async () => ({
  displays: getRoamDisplays(),
  currentDisplayId: currentRoamDisplayTarget,
}));

ipcMain.handle('desktop:moveToDisplay', async (_event, targetDisplay) => {
  if (!mainWindow || !isRoamOverlayActive) return { ok: false };
  currentRoamDisplayTarget = targetDisplay;
  const bounds = getRoamTargetBounds(targetDisplay);
  mainWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
  return {
    ok: true,
    bounds,
    currentDisplayId: currentRoamDisplayTarget,
    displays: getRoamDisplays(),
  };
});
ipcMain.handle('studio:moveToDisplay', async (_event, targetDisplay) => {
  if (!mainWindow || !isRoamOverlayActive) return { ok: false };
  currentRoamDisplayTarget = targetDisplay;
  const bounds = getRoamTargetBounds(targetDisplay);
  mainWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
  return {
    ok: true,
    bounds,
    currentDisplayId: currentRoamDisplayTarget,
    displays: getRoamDisplays(),
  };
});

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

ipcMain.handle('desktop:captureScreen', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 },
    });
    if (!sources || sources.length === 0) return { ok: false, error: 'No screen sources available' };
    const primary = sources[0];
    const buffer = primary.thumbnail.toJPEG(80);
    return {
      ok: true,
      dataUrl: primary.thumbnail.toDataURL(),
      base64: buffer.toString('base64'),
      mimeType: 'image/jpeg',
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('studio:captureScreen', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 },
    });
    if (!sources || sources.length === 0) return { ok: false, error: 'No screen sources available' };
    const primary = sources[0];
    const buffer = primary.thumbnail.toJPEG(80);
    return {
      ok: true,
      dataUrl: primary.thumbnail.toDataURL(),
      base64: buffer.toString('base64'),
      mimeType: 'image/jpeg',
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
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

// Desktop awareness and app control (see desktopControl.cjs)
require('./desktopControl.cjs').registerDesktopControl(ipcMain);

async function handleFetchJapaneseTts(_event, spokenText) {
  try {
    const text = String(spokenText || '').slice(0, 180).trim();
    if (!text) return { ok: false, error: 'Empty text' };

    // Endpoint 1: Google Translate TTS (tw-ob client)
    try {
      const url1 = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ja&client=tw-ob&q=${encodeURIComponent(text)}`;
      const res1 = await fetch(url1, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'audio/mpeg, audio/*;q=0.9',
        },
      });
      if (res1.ok) {
        const arrayBuf = await res1.arrayBuffer();
        if (arrayBuf.byteLength > 100) {
          const base64 = Buffer.from(arrayBuf).toString('base64');
          return { ok: true, base64, mimeType: 'audio/mpeg' };
        }
      }
    } catch (err1) {
      console.warn('[ELECTRON] tw-ob Google TTS attempt failed:', err1);
    }

    // Endpoint 2: Google Translate TTS (gtx client)
    try {
      const url2 = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=ja&q=${encodeURIComponent(text)}`;
      const res2 = await fetch(url2, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'audio/mpeg, audio/*;q=0.9',
        },
      });
      if (res2.ok) {
        const arrayBuf = await res2.arrayBuffer();
        if (arrayBuf.byteLength > 100) {
          const base64 = Buffer.from(arrayBuf).toString('base64');
          return { ok: true, base64, mimeType: 'audio/mpeg' };
        }
      }
    } catch (err2) {
      console.warn('[ELECTRON] gtx Google TTS attempt failed:', err2);
    }

    return { ok: false, error: 'Google Japanese TTS endpoints both returned error or empty audio' };
  } catch (err) {
    console.error('[ELECTRON] handleFetchJapaneseTts failed:', err);
    return { ok: false, error: String(err) };
  }
}

async function handleRequestGeminiTts(_event, params) {
  try {
    const { apiKey, model, prompt, voiceName } = params || {};
    // Auto-resolve apiKey from local .env if caller omitted it
    const effectiveKey = apiKey || readLocalEnvApiKey().key;
    if (!effectiveKey) return { ok: false, errBody: 'Missing API Key' };

    const targetModel = model || 'gemini-2.5-flash-preview-tts';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      targetModel
    )}:generateContent?key=${encodeURIComponent(effectiveKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': effectiveKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName || 'Aoede',
              },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, status: res.status, errBody: errText };
    }

    const data = await res.json();
    const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (inlineData?.data) {
      return {
        ok: true,
        base64: inlineData.data,
        mimeType: inlineData.mimeType || 'audio/L16;rate=24000',
      };
    }
    return { ok: false, errBody: 'No audio returned in response parts' };
  } catch (err) {
    console.error('[ELECTRON] handleRequestGeminiTts failed:', err);
    return { ok: false, errBody: String(err) };
  }
}

function listLmStudioChatModels(modelsData) {
  const list = Array.isArray(modelsData?.data) ? modelsData.data : [];
  return list.map((m) => m?.id).filter((id) => typeof id === 'string' && !/embed/i.test(id));
}

function pickLmStudioModel(modelsData) {
  const ids = listLmStudioChatModels(modelsData);
  if (ids.includes('qwen2.5-7b-instruct-1m')) return 'qwen2.5-7b-instruct-1m';
  if (ids.length > 0) return ids[0];
  return 'qwen2.5-7b-instruct-1m';
}

async function handleCheckLocalAi() {
  try {
    const res = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { ok: false, error: `LM Studio HTTP ${res.status}` };
    const data = await res.json();
    const models = listLmStudioChatModels(data);
    const model = pickLmStudioModel(data);
    return { ok: true, model, models, engine: 'lm-studio' };
  } catch (err) {
    return { ok: false, error: `LM Studio (:1234) not reachable: ${String(err)}` };
  }
}

async function handleQueryLocalAi(_event, params) {
  const { messages, temperature = 0.85, maxTokens = 350, model: requestedModel } = params || {};
  try {
    let modelId = requestedModel || 'qwen2.5-7b-instruct-1m';
    if (!requestedModel) {
      try {
        const mRes = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(2000) });
        if (mRes.ok) {
          const mData = await mRes.json();
          modelId = pickLmStudioModel(mData);
        }
      } catch {
        // keep default modelId
      }
    }

    const res = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `LM Studio HTTP ${res.status}: ${err}` };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    const resolvedModel = data?.model || modelId;
    return { ok: true, text, resolvedModel };
  } catch (err) {
    return { ok: false, error: `LM Studio (:1234) error: ${String(err)}` };
  }
}

async function handleSynthesizeVoicevox(_event, params) {
  try {
    const { text, speakerId = 8 } = params;
    const clean = (text || '').slice(0, 240).trim();
    if (!clean) return { ok: false, error: 'Empty text' };
    const qRes = await fetch(
      `http://127.0.0.1:50021/audio_query?text=${encodeURIComponent(clean)}&speaker=${speakerId}`,
      { method: 'POST', signal: AbortSignal.timeout(4000) }
    );
    if (!qRes.ok) return { ok: false, error: `audio_query HTTP ${qRes.status}` };
    const qJson = await qRes.json();
    const sRes = await fetch(`http://127.0.0.1:50021/synthesis?speaker=${speakerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(qJson),
      signal: AbortSignal.timeout(15000),
    });
    if (!sRes.ok) return { ok: false, error: `synthesis HTTP ${sRes.status}` };
    const arrayBuffer = await sRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return { ok: true, base64, mimeType: 'audio/wav' };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function handleTranscribeAudio(_event, params) {
  try {
    const { base64Audio, mimeType = 'audio/webm', lang = 'ja' } = params;
    if (!base64Audio) return { ok: false, error: 'Empty audio buffer.' };

    const buffer = Buffer.from(base64Audio, 'base64');
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    formData.append('file', blob, `input.${mimeType.includes('wav') ? 'wav' : 'webm'}`);
    formData.append('model', 'whisper-1');
    formData.append('language', lang.startsWith('ja') ? 'ja' : 'en');

    // Attempt OpenAI-compatible local Whisper endpoints (e.g. LM Studio, Faster-Whisper, Whisper.cpp)
    const endpoints = [
      'http://127.0.0.1:1234/v1/audio/transcriptions',
      'http://127.0.0.1:8000/v1/audio/transcriptions',
      'http://127.0.0.1:9000/v1/audio/transcriptions',
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.text) {
            return { ok: true, text: json.text.trim() };
          }
        }
      } catch {
        // try next endpoint
      }
    }

    return {
      ok: false,
      error: 'No local Whisper / STT server detected on http://127.0.0.1:1234 or :8000. Start a local Faster-Whisper server for 100% offline speech recognition.',
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Register both studio: and desktop: channels for backwards and cross-component compatibility
ipcMain.handle('studio:fetchJapaneseTts', handleFetchJapaneseTts);
ipcMain.handle('desktop:fetchJapaneseTts', handleFetchJapaneseTts);
ipcMain.handle('studio:requestGeminiTts', handleRequestGeminiTts);
ipcMain.handle('desktop:requestGeminiTts', handleRequestGeminiTts);
ipcMain.handle('studio:checkLocalAi', handleCheckLocalAi);
ipcMain.handle('desktop:checkLocalAi', handleCheckLocalAi);
ipcMain.handle('studio:queryLocalAi', handleQueryLocalAi);
ipcMain.handle('desktop:queryLocalAi', handleQueryLocalAi);
ipcMain.handle('studio:synthesizeVoicevox', handleSynthesizeVoicevox);
ipcMain.handle('desktop:synthesizeVoicevox', handleSynthesizeVoicevox);
ipcMain.handle('studio:transcribeAudio', handleTranscribeAudio);
ipcMain.handle('desktop:transcribeAudio', handleTranscribeAudio);

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
