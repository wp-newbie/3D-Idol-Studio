const { spawn } = require('child_process');
const electronBinary = require('electron');
const fs = require('fs');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let child = null;
let isRestarting = false;

function launchElectron() {
  child = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    env,
  });

  child.on('exit', (code) => {
    if (!isRestarting) {
      process.exit(code ?? 0);
    }
  });
}

let debounceTimer = null;
function restartElectron() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    isRestarting = true;
    if (child) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    setTimeout(() => {
      isRestarting = false;
      console.log('[ELECTRON LAUNCHER] Reloading Electron main process...');
      launchElectron();
    }, 400);
  }, 300);
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
