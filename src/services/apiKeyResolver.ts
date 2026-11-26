export const LOCAL_STORAGE_API_KEY = 'gemini_api_key';
export const LOCAL_STORAGE_USER_SAVED_FLAG = 'gemini_api_key_user_saved';
export const STUDIO_SETUP_COMPLETE_KEY = 'studio_setup_complete';

export function isStudioSetupComplete(): boolean {
  try {
    return window.localStorage.getItem(STUDIO_SETUP_COMPLETE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markStudioSetupComplete(): void {
  try {
    window.localStorage.setItem(STUDIO_SETUP_COMPLETE_KEY, 'true');
  } catch {
    // ignore storage errors
  }
}

/**
 * Reads the bundled built-in default Gemini API key (`VITE_DEFAULT_GEMINI_API_KEY`)
 * without exposing it in any user-facing input fields.
 */
export function getBuiltInDefaultApiKey(): string {
  const metaEnv = (import.meta.env || {}) as Record<string, string | undefined>;
  const candidates = [
    metaEnv.VITE_DEFAULT_GEMINI_API_KEY,
    typeof __DEFAULT_GEMINI_API_KEY__ !== 'undefined' ? __DEFAULT_GEMINI_API_KEY__ : '',
    metaEnv.VITE_GEMINI_API_KEY,
    typeof __ENV_GEMINI_API_KEY__ !== 'undefined' ? __ENV_GEMINI_API_KEY__ : '',
  ];
  for (const c of candidates) {
    const cleaned = sanitizeApiKey(c);
    if (cleaned.length > 8) return cleaned;
  }
  return '';
}

export function hasBuiltInDefaultApiKey(): boolean {
  return getBuiltInDefaultApiKey().length > 8;
}

/**
 * Resolves the active API key to send on Gemini API / TTS requests.
 * Respects `useBuiltInKey` so the built-in key works seamlessly without revealing it in the UI.
 */
export function resolveEffectiveApiKey(settings: {
  apiKey?: string;
  useBuiltInKey?: boolean;
}): string {
  if (settings.useBuiltInKey) {
    return getBuiltInDefaultApiKey();
  }
  return sanitizeApiKey(settings.apiKey);
}

export interface ResolvedKeyResult {
  apiKey: string;
  source:
    | 'url-hash'
    | 'aistudio-bridge'
    | 'desktop-config'
    | 'electron-env'
    | 'vite-env'
    | 'localStorage'
    | 'none';
  hasAiStudioBridge: boolean;
}

/**
 * Sanitizes an API key by stripping leading/trailing whitespace, newlines,
 * and wrapping quotes (single or double) copied from .env files or terminals.
 * Never accepts masked bullet characters (••••).
 */
export function sanitizeApiKey(key?: string | null): string {
  if (!key) return '';
  const cleaned = key
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!cleaned || /•/.test(cleaned)) return '';
  return cleaned;
}

/**
 * Persists an API key to localStorage (and Electron userData api-config.json) after sanitizing.
 * Marks an explicit user action flag so fallback .env keys will not overwrite it.
 */
export function saveKeyToLocalStorage(apiKey: string): void {
  const raw = (apiKey || '').trim();
  if (/•/.test(raw)) {
    // Guard: never persist masked bullet characters
    return;
  }
  const sanitized = sanitizeApiKey(raw);
  try {
    if (sanitized) {
      window.localStorage.setItem(LOCAL_STORAGE_API_KEY, sanitized);
      window.localStorage.setItem(LOCAL_STORAGE_USER_SAVED_FLAG, 'true');
    } else {
      window.localStorage.removeItem(LOCAL_STORAGE_API_KEY);
      // Explicitly mark that the user cleared the key so stale .env won't resurrect
      window.localStorage.setItem(LOCAL_STORAGE_USER_SAVED_FLAG, 'cleared');
    }
  } catch {
    // ignore storage errors
  }

  // Persist to Electron userData api-config.json so packaged .exe remembers the key across launches
  if (typeof window !== 'undefined' && window.desktopBridge?.saveApiKey) {
    void window.desktopBridge.saveApiKey(sanitized).catch(() => {
      // ignore IPC errors
    });
  }
}

export function readKeyFromLocalStorage(): string {
  try {
    return sanitizeApiKey(window.localStorage.getItem(LOCAL_STORAGE_API_KEY));
  } catch {
    return '';
  }
}

/**
 * Extracts `#apikey=AIza...` (or `#apikey=AQ...`) from the URL hash, saves it to localStorage,
 * and strips the sensitive hash from the address bar immediately.
 */
function extractAndStripUrlHashKey(): string {
  try {
    const hash = window.location.hash || '';
    const match = /[#&?]apikey=([^&]+)/i.exec(hash);
    if (!match) return '';
    const decoded = sanitizeApiKey(decodeURIComponent(match[1]));
    if (!decoded) return '';
    saveKeyToLocalStorage(decoded);
    window.history.replaceState(
      null,
      document.title,
      window.location.pathname + window.location.search
    );
    return decoded;
  } catch {
    return '';
  }
}

function readProcessOrViteEnvKey(): string {
  const metaEnv = (import.meta.env || {}) as Record<string, string | undefined>;
  const procEnv =
    typeof process !== 'undefined' && process.env
      ? (process.env as Record<string, string | undefined>)
      : {};

  const candidates = [
    metaEnv.VITE_GEMINI_API_KEY,
    metaEnv.VITE_DEFAULT_GEMINI_API_KEY,
    metaEnv.GEMINI_API_KEY,
    procEnv.API_KEY,
    procEnv.GEMINI_API_KEY,
    typeof __ENV_GEMINI_API_KEY__ !== 'undefined' ? __ENV_GEMINI_API_KEY__ : '',
    typeof __DEFAULT_GEMINI_API_KEY__ !== 'undefined' ? __DEFAULT_GEMINI_API_KEY__ : '',
  ];

  for (const c of candidates) {
    const sanitized = sanitizeApiKey(c);
    if (sanitized.length > 8) {
      return sanitized;
    }
  }
  return '';
}

/**
 * Automatically resolves the active Gemini API key on startup from the prioritized source:
 * 1. URL hash `#apikey=...` (explicit, immediately stripped & saved to localStorage)
 * 2. Persisted user-saved `localStorage` or active settings (takes priority over stale .env)
 * 3. Google AI Studio host bridge (`window.aistudio` + injected `process.env.API_KEY`)
 * 4. Electron desktop `.env` via IPC (`window.studioAPI.readLocalEnvKey`) — only if not cleared by user
 * 5. Vite dev/build env (`VITE_GEMINI_API_KEY`) — only if not cleared by user
 */
export async function resolveStartupApiKey(
  existingSettingsKey?: string
): Promise<ResolvedKeyResult> {
  const hasAiStudioBridge = Boolean(
    window.aistudio &&
      (typeof window.aistudio.openSelectKey === 'function' ||
        typeof window.aistudio.hasSelectedApiKey === 'function')
  );

  // 1. URL hash (#apikey=...)
  const hashKey = extractAndStripUrlHashKey();
  if (hashKey) {
    return { apiKey: hashKey, source: 'url-hash', hasAiStudioBridge };
  }

  // Check if the user has an existing saved key or explicitly cleared it in settings
  const lsKey = readKeyFromLocalStorage();
  const settingsKey = sanitizeApiKey(existingSettingsKey);
  const activeUserKey = lsKey || settingsKey;

  let userSavedFlag: string | null = null;
  try {
    userSavedFlag = window.localStorage.getItem(LOCAL_STORAGE_USER_SAVED_FLAG);
  } catch {
    // ignore
  }

  // 2. Persisted user-saved key has priority
  if (activeUserKey) {
    saveKeyToLocalStorage(activeUserKey);
    return { apiKey: activeUserKey, source: 'localStorage', hasAiStudioBridge };
  }

  // 2.5 Electron userData local api-config.json (remembers key across standalone .exe launches)
  if (userSavedFlag !== 'cleared' && window.desktopBridge?.readApiKey) {
    try {
      const cfg = await window.desktopBridge.readApiKey();
      const desktopKey = sanitizeApiKey(cfg?.apiKey);
      if (desktopKey && desktopKey.length > 8) {
        try {
          window.localStorage.setItem(LOCAL_STORAGE_API_KEY, desktopKey);
          window.localStorage.setItem(LOCAL_STORAGE_USER_SAVED_FLAG, 'true');
        } catch {
          // ignore
        }
        return {
          apiKey: desktopKey,
          source: 'desktop-config',
          hasAiStudioBridge,
        };
      }
    } catch {
      // continue
    }
  }

  // If the user explicitly cleared their key in Settings, don't resurrect a stale .env key
  if (userSavedFlag === 'cleared') {
    return { apiKey: '', source: 'none', hasAiStudioBridge };
  }

  // 3. Google AI Studio Host Bridge (window.aistudio)
  if (window.aistudio) {
    try {
      const hasSelected = window.aistudio.hasSelectedApiKey
        ? await window.aistudio.hasSelectedApiKey()
        : false;
      const bridgeKey = window.aistudio.getApiKey
        ? await window.aistudio.getApiKey()
        : undefined;
      const resolvedBridgeKey = sanitizeApiKey(
        bridgeKey || (hasSelected ? readProcessOrViteEnvKey() : '')
      );
      if (resolvedBridgeKey) {
        saveKeyToLocalStorage(resolvedBridgeKey);
        return {
          apiKey: resolvedBridgeKey,
          source: 'aistudio-bridge',
          hasAiStudioBridge,
        };
      }
    } catch {
      // continue to next source
    }
  }

  // 4. Local Desktop .env via Electron IPC (fallback only if no user key was saved/cleared)
  if (window.studioAPI?.readLocalEnvKey) {
    try {
      const res = await window.studioAPI.readLocalEnvKey();
      const sanitizedEnvKey = sanitizeApiKey(res?.key);
      if (sanitizedEnvKey && sanitizedEnvKey.length > 8) {
        saveKeyToLocalStorage(sanitizedEnvKey);
        return {
          apiKey: sanitizedEnvKey,
          source: 'electron-env',
          hasAiStudioBridge,
        };
      }
    } catch {
      // continue
    }
  }

  // 5. Vite / process env fallback
  const viteKey = readProcessOrViteEnvKey();
  if (viteKey) {
    saveKeyToLocalStorage(viteKey);
    return { apiKey: viteKey, source: 'vite-env', hasAiStudioBridge };
  }

  return { apiKey: '', source: 'none', hasAiStudioBridge };
}
