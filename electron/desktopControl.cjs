/**
 * Desktop awareness & control for the studio companion (Windows).
 *
 * Safety model (the model's output is untrusted — it can be steered by anything shown on screen):
 *  - No user/model-supplied text is ever interpolated into PowerShell source. Values travel through
 *    environment variables and scripts are sent with -EncodedCommand.
 *  - Launch: aliases, http(s)/mailto URLs and bare app names only (no paths, no scripts/installers).
 *  - Close: graceful CloseMainWindow only (unsaved-work prompts still appear); never force-kills,
 *    and never touches the shell, system processes or this app.
 */
const { execFile } = require('child_process');
const { shell } = require('electron');

const LAUNCH_ALIASES = {
  calc: { exe: 'calc.exe' },
  calculator: { exe: 'calc.exe' },
  notepad: { exe: 'notepad.exe' },
  notes: { exe: 'notepad.exe' },
  paint: { exe: 'mspaint.exe' },
  mspaint: { exe: 'mspaint.exe' },
  spotify: { uri: 'spotify:' },
  discord: { uri: 'discord:' },
  code: { exe: 'code' },
  vscode: { exe: 'code' },
  'vs code': { exe: 'code' },
  chrome: { exe: 'chrome.exe' },
  'google chrome': { exe: 'chrome.exe' },
  edge: { exe: 'msedge.exe' },
  'microsoft edge': { exe: 'msedge.exe' },
  browser: { uri: 'https://www.google.com' },
  youtube: { uri: 'https://www.youtube.com' },
  google: { uri: 'https://www.google.com' },
  twitch: { uri: 'https://www.twitch.tv' },
  netflix: { uri: 'https://www.netflix.com' },
  terminal: { exe: 'wt.exe' },
  explorer: { exe: 'explorer.exe' },
  files: { exe: 'explorer.exe' },
  'task manager': { exe: 'taskmgr.exe' },
  taskmgr: { exe: 'taskmgr.exe' },
};

// Window-title / process keyword used when closing or focusing by friendly name.
const MATCH_ALIASES = {
  calc: 'calculator',
  notes: 'notepad',
  paint: 'paint',
  mspaint: 'paint',
  vscode: 'visual studio code',
  'vs code': 'visual studio code',
  code: 'visual studio code',
  edge: 'edge',
  browser: 'edge',
  'google chrome': 'chrome',
  'microsoft edge': 'edge',
  files: 'file explorer',
};

const BLOCKED_EXTENSIONS = /\.(ps1|psm1|bat|cmd|vbs|vbe|js|jse|wsf|msi|reg|scr|com|hta|jar|lnk)$/i;
const SAFE_APP_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,59}$/;

const BROWSER_SUFFIX =
  /\s[-–—]\s(?:Google Chrome|Microsoft Edge|Mozilla Firefox|Brave|Opera(?: GX)?|Vivaldi|Chromium)(?:\s[-–—]\s.*)?$/i;

function encodePs(script) {
  const prelude = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$ErrorActionPreference="SilentlyContinue";\n';
  return Buffer.from(prelude + script, 'utf16le').toString('base64');
}

function runPowerShell(script, extraEnv = {}, timeout = 6000) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ err: new Error('Windows only'), stdout: '' });
      return;
    }
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePs(script)],
      {
        timeout,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        encoding: 'utf8',
        env: { ...process.env, ...extraEnv },
      },
      (err, stdout) => resolve({ err, stdout: String(stdout || '') })
    );
  });
}

const FG_TYPE = [
  'Add-Type -TypeDefinition @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class ZetaWin {',
  '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
  '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);',
  '  public static uint ForegroundPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }',
  '}',
  '"@',
].join('\n');

const LIST_SCRIPT = [
  FG_TYPE,
  '$fg = [ZetaWin]::ForegroundPid()',
  '$items = @(Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object {',
  '  [PSCustomObject]@{ id = $_.Id; name = $_.ProcessName; title = $_.MainWindowTitle; isActive = ($_.Id -eq $fg) }',
  '})',
  'ConvertTo-Json -Compress -InputObject $items',
].join('\n');

function friendlyName(p) {
  // UWP apps are hosted by ApplicationFrameHost; their window title is the useful name.
  if (/^applicationframehost$/i.test(p.name)) return p.title;
  return p.name;
}

/**
 * Best-effort "what is playing" from window titles (Spotify desktop writes "Artist - Song" while
 * playing; browsers expose the foreground tab title of each window).
 */
function deriveNowPlaying(apps) {
  for (const a of apps) {
    if (/^spotify$/i.test(a.name)) {
      const t = String(a.title || '').trim();
      if (t && !/^spotify(\s(free|premium))?$/i.test(t)) {
        const idx = t.indexOf(' - ');
        return idx > 0
          ? { source: 'Spotify', artist: t.slice(0, idx).trim(), title: t.slice(idx + 3).trim() }
          : { source: 'Spotify', title: t };
      }
    }
  }
  const patterns = [
    [/^(?:\(\d+\)\s*)?(.+?)\s-\sYouTube Music$/i, 'YouTube Music'],
    [/^(?:\(\d+\)\s*)?(.+?)\s-\sYouTube$/i, 'YouTube'],
    [/^(.+?)\s-\sVLC media player$/i, 'VLC'],
    [/^(.+?)\s-\sTwitch$/i, 'Twitch'],
    [/^(.+?)\s-\sNetflix$/i, 'Netflix'],
  ];
  // Prefer the active window, then the rest.
  const ordered = [...apps].sort((x, y) => Number(Boolean(y.isActive)) - Number(Boolean(x.isActive)));
  for (const a of ordered) {
    const t = String(a.title || '').replace(BROWSER_SUFFIX, '').trim();
    for (const [re, source] of patterns) {
      const m = re.exec(t);
      if (m && m[1] && !/^(home|youtube|new tab)$/i.test(m[1].trim())) {
        return { source, title: m[1].trim().slice(0, 140) };
      }
    }
  }
  return null;
}

async function listRunningApps(filter) {
  const { err, stdout } = await runPowerShell(LIST_SCRIPT);
  if (err && !stdout) return { ok: false, apps: [], activeApp: null, error: String(err.message || err) };
  let parsed = [];
  try {
    const raw = stdout.trim();
    if (raw) {
      const data = JSON.parse(raw);
      parsed = Array.isArray(data) ? data : [data];
    }
  } catch (e) {
    return { ok: false, apps: [], activeApp: null, error: `Parse error: ${e.message}` };
  }
  let apps = parsed
    .filter((p) => p && p.title && !/zeta 3d idol studio|program manager/i.test(p.title))
    .map((p) => ({ id: p.id, name: String(p.name), title: String(p.title), isActive: Boolean(p.isActive) }));
  if (typeof filter === 'string' && filter.trim()) {
    const f = filter.trim().toLowerCase();
    apps = apps.filter((a) => a.name.toLowerCase().includes(f) || a.title.toLowerCase().includes(f));
  }
  const active = apps.find((a) => a.isActive);
  return { ok: true, apps, activeApp: active ? friendlyName(active) : null };
}

async function getDesktopSnapshot() {
  const res = await listRunningApps();
  if (!res.ok) return { ok: false, error: res.error };
  const names = [];
  for (const a of res.apps) {
    const n = friendlyName(a);
    if (n && !names.includes(n)) names.push(n);
  }
  return {
    ok: true,
    activeApp: res.activeApp,
    openApps: names.slice(0, 24),
    nowPlaying: deriveNowPlaying(res.apps),
    capturedAt: Date.now(),
  };
}

async function launchApp(target) {
  const raw = typeof target === 'string' ? target.trim() : '';
  if (!raw) return { ok: false, error: 'Empty application target' };

  const openUrl = async (url) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return { ok: false, error: 'Invalid URL' };
    }
    if (!/^(https?:|mailto:|spotify:|discord:)$/.test(u.protocol)) {
      return { ok: false, error: `Blocked protocol ${u.protocol}` };
    }
    try {
      await shell.openExternal(u.href);
      return { ok: true, target: u.href };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  };

  if (/^(https?|mailto):/i.test(raw)) return openUrl(raw);
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(raw)) return openUrl(`https://${raw}`);

  const alias = LAUNCH_ALIASES[raw.toLowerCase()];
  if (alias && alias.uri) return openUrl(alias.uri);

  const exe = alias ? alias.exe : raw;
  if (!SAFE_APP_NAME.test(exe) || BLOCKED_EXTENSIONS.test(exe)) {
    return { ok: false, error: `Refusing to launch "${raw}" (only plain app names and web links are allowed)` };
  }
  const { err } = await runPowerShell('Start-Process -FilePath $env:ZETA_ARG -ErrorAction Stop', { ZETA_ARG: exe });
  if (err) return { ok: false, error: `Could not launch "${raw}" — is it installed?` };
  return { ok: true, target: exe };
}

const PROTECTED_PROCESSES = [
  'explorer', 'system', 'idle', 'csrss', 'winlogon', 'wininit', 'services', 'lsass', 'svchost',
  'smss', 'dwm', 'fontdrvhost', 'registry', 'electron', 'zeta 3d idol studio', 'searchhost',
  'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost',
];

function matchKeyword(target) {
  const t = String(target || '').trim().replace(/\.exe$/i, '').slice(0, 80).toLowerCase();
  return MATCH_ALIASES[t] || t;
}

async function closeApp(target) {
  const kw = matchKeyword(target);
  if (!kw) return { ok: false, error: 'Empty app target to close' };
  if (PROTECTED_PROCESSES.includes(kw)) return { ok: false, error: `"${target}" is protected and will not be closed` };
  const script = [
    '$t = $env:ZETA_ARG.ToLower()',
    '$self = [int]$env:ZETA_SELF',
    `$prot = @(${PROTECTED_PROCESSES.map((p) => `'${p}'`).join(',')})`,
    '$hits = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Id -ne $self -and ($prot -notcontains $_.ProcessName.ToLower()) -and ($_.ProcessName.ToLower() -eq $t -or $_.MainWindowTitle.ToLower().Contains($t)) })',
    'if ($hits.Count -eq 0) { "NOT_FOUND"; exit }',
    '$n = 0; foreach ($p in $hits) { if ($p.CloseMainWindow()) { $n++ } }',
    '"OK:$n"',
  ].join('\n');
  const { err, stdout } = await runPowerShell(script, { ZETA_ARG: kw, ZETA_SELF: String(process.pid) });
  const out = stdout.trim();
  if (out.startsWith('OK:')) return { ok: true, target: String(target), killedCount: parseInt(out.slice(3), 10) || 0 };
  if (out === 'NOT_FOUND') return { ok: false, error: `No open window found matching "${target}"` };
  return { ok: false, error: err ? String(err.message || err) : 'Unknown error' };
}

async function focusApp(target) {
  const kw = matchKeyword(target);
  if (!kw) return { ok: false, error: 'Empty target to focus' };
  const script = [
    FG_TYPE,
    '$t = $env:ZETA_ARG.ToLower()',
    '$self = [int]$env:ZETA_SELF',
    '$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Id -ne $self -and ($_.ProcessName.ToLower() -eq $t -or $_.MainWindowTitle.ToLower().Contains($t)) } | Select-Object -First 1',
    'if (-not $p) { "NOT_FOUND"; exit }',
    '[void][ZetaWin]::ShowWindow($p.MainWindowHandle, 9)',
    '[void][ZetaWin]::SetForegroundWindow($p.MainWindowHandle)',
    '[void](New-Object -ComObject WScript.Shell).AppActivate([int]$p.Id)',
    '"OK"',
  ].join('\n');
  const { stdout } = await runPowerShell(script, { ZETA_ARG: kw, ZETA_SELF: String(process.pid) });
  return stdout.trim().endsWith('OK')
    ? { ok: true, appName: String(target) }
    : { ok: false, error: `Could not find a window for "${target}"` };
}

const IMAGE_HOST_ALLOWLIST = new Set(['image.pollinations.ai']);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

async function fetchImage(url) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (u.protocol !== 'https:' || !IMAGE_HOST_ALLOWLIST.has(u.hostname)) {
    return { ok: false, error: `Image host not allowed: ${u.hostname}` };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(u.href, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//i.test(mimeType)) return { ok: false, error: `Unexpected content type ${mimeType}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: 'Image too large' };
    return { ok: true, base64: buf.toString('base64'), mimeType };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'Image request timed out' : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

function registerDesktopControl(ipcMain) {
  for (const prefix of ['desktop', 'studio']) {
    ipcMain.handle(`${prefix}:listRunningApps`, (_e, filter) => listRunningApps(filter));
    ipcMain.handle(`${prefix}:getDesktopSnapshot`, () => getDesktopSnapshot());
    ipcMain.handle(`${prefix}:launchApp`, (_e, target) => launchApp(target));
    ipcMain.handle(`${prefix}:closeApp`, (_e, target) => closeApp(target));
    ipcMain.handle(`${prefix}:focusApp`, (_e, target) => focusApp(target));
    ipcMain.handle(`${prefix}:fetchImage`, (_e, url) => fetchImage(url));
  }
}

module.exports = { registerDesktopControl, deriveNowPlaying, launchApp, closeApp, listRunningApps, runPowerShell, LIST_SCRIPT };
