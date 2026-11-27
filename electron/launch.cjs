const { spawn } = require('child_process');
const electronBinary = require('electron');
const fs = require('fs');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let child = null;
let isRestarting = false;

function launchElectron() {
  const proc = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    env,
  });
  child = proc;

  proc.on('exit', (code) => {
    if (child === proc) child = null;
    if (!isRestarting) {
      process.exit(code ?? 0);
    }
  });
}

function stopCurrentChild() {
  return new Promise((resolve) => {
    const prev = child;
    if (!prev || prev.exitCode !== null || prev.killed) {
      child = null;
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (child === prev) child = null;
      resolve();
    };
    prev.once('exit', finish);
    try {
      prev.kill('SIGTERM');
    } catch {
      finish();
      return;
    }
    // Wait gracefully for Chromium disk cache / state files to flush before relaunching
    setTimeout(() => {
      if (!settled) {
        try {
          prev.kill('SIGKILL');
        } catch {
          // ignore
        }
        setTimeout(finish, 150);
      }
    }, 1500);
  });
}

let debounceTimer = null;
function restartElectron() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (isRestarting) return;
    isRestarting = true;
    await stopCurrentChild();
    // Small settle delay so Windows releases userData file handles cleanly
    await new Promise((r) => setTimeout(r, 250));
    isRestarting = false;
    console.log('[ELECTRON LAUNCHER] Reloading Electron main process...');
    launchElectron();
  }, 450);
}

launchElectron();

// Auto-reload Electron whenever electron/ scripts change
const electronDir = path.resolve(__dirname);
try {
  fs.watch(electronDir, (eventType, filename) => {
    if (
      filename &&
      (filename.endsWith('.cjs') || filename.endsWith('.js')) &&
      filename !== 'launch.cjs'
    ) {
      restartElectron();
    }
  });
} catch {
  // ignore watch errors
}
