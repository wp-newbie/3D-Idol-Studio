import { defineConfig, loadEnv } from 'vite';
import fs from 'fs';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const defaultGeminiKey =
    env.VITE_DEFAULT_GEMINI_API_KEY ||
    env.GEMINI_API_KEY ||
    env.VITE_GEMINI_API_KEY ||
    env.API_KEY ||
    '';
  const geminiKey =
    env.GEMINI_API_KEY ||
    env.VITE_GEMINI_API_KEY ||
    env.VITE_DEFAULT_GEMINI_API_KEY ||
    env.API_KEY ||
    '';

  return {
    base: './',
    envPrefix: ['VITE_', 'GEMINI_'],
    plugins: [
      react(),
      {
        name: 'studio-workspace-sync',
        configureServer(server) {
          const syncFilePath = path.resolve(process.cwd(), '.studio-sync.json');
          const vaultDir = path.resolve(process.cwd(), 'public/vault-sync');

          if (!fs.existsSync(vaultDir)) {
            try {
              fs.mkdirSync(vaultDir, { recursive: true });
            } catch {
              // ignore
            }
          }

          const readSyncFile = () => {
            try {
              if (fs.existsSync(syncFilePath)) {
                const data = fs.readFileSync(syncFilePath, 'utf8');
                return JSON.parse(data);
              }
              return null;
            } catch {
              return null;
            }
          };

          server.middlewares.use('/__studio-sync', (req, res, next) => {
            // Enable CORS for Electron desktop app and web preview
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
              res.statusCode = 204;
              res.end();
              return;
            }

            if (req.method === 'GET') {
              const state = readSyncFile();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(state || {}));
            } else if (req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const payload = JSON.parse(body);
                  const stateToSave =
                    payload.state && typeof payload.state === 'object'
                      ? payload.state
                      : payload.personas
                      ? payload
                      : null;

                  if (stateToSave) {
                    const currentDisk = readSyncFile();
                    const diskUpdated = currentDisk?.updatedAt || 0;
                    const incomingUpdated = stateToSave.updatedAt || 0;

                    // Enforce latest-wins: only save if incoming is equal or newer
                    if (incomingUpdated >= diskUpdated || !diskUpdated) {
                      fs.writeFileSync(syncFilePath, JSON.stringify(stateToSave, null, 2), 'utf8');
                      res.statusCode = 200;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true, savedAt: Date.now() }));
                    } else {
                      // Reject older state and return the latest state from disk
                      res.statusCode = 409;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(
                        JSON.stringify({
                          ok: false,
                          conflict: true,
                          latestState: currentDisk,
                          message: 'Workspace on disk is newer (latest-wins enforced)',
                        })
                      );
                    }
                  } else {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: false, error: 'Invalid state payload' }));
                  }

                  if (payload.files && typeof payload.files === 'object') {
                    for (const [name, content] of Object.entries(payload.files)) {
                      const safeName = path.basename(name);
                      const filePath = path.join(vaultDir, safeName);
                      const buffer = Buffer.from(content as string, 'base64');
                      fs.writeFileSync(filePath, buffer);
                    }
                  }
                } catch (err) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: false, error: String(err) }));
                }
              });
            } else {
              next();
            }
          });
        },
      },
    ],
    define: {
      __ENV_GEMINI_API_KEY__: JSON.stringify(geminiKey),
      __DEFAULT_GEMINI_API_KEY__: JSON.stringify(defaultGeminiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
      'process.env.API_KEY': JSON.stringify(geminiKey),
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      watch: {
        ignored: ['**/release/**', '**/dist/**', '**/scratch/**'],
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 2500,
    },
  };
});
