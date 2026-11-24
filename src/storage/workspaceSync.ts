import type { PersistedStudioState } from '../types/studio';

export function getSyncEndpoint(): string {
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.protocol.startsWith('http')) {
      // In web browser (localhost, LAN IP like http://192.168.50.49:5173, or public URL),
      // relative path connects to the current host
      return '/__studio-sync';
    }
  }
  // In Electron desktop running file:// protocol, connect to local dev server
  return 'http://localhost:5173/__studio-sync';
}

let pushTimer: number | null = null;
let lastPushedTimestamp = 0;
let isSyncing = false;

/**
 * Fetches the current synced workspace state from the Vite dev server middleware (/.studio-sync.json).
 * Safe to call from both the browser and Electron desktop app.
 */
export async function fetchWorkspaceSyncState(): Promise<PersistedStudioState | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(getSyncEndpoint(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = (await res.json()) as PersistedStudioState;
    if (data && Array.isArray(data.personas) && data.personas.length > 0) {
      return data;
    }
    return null;
  } catch {
    // Vite dev server may not be active or request timed out
    return null;
  }
}

export interface PushSyncResult {
  ok: boolean;
  latestState?: PersistedStudioState;
}

/**
 * Pushes the studio state to the Vite dev server middleware to persist to .studio-sync.json.
 * If server has a newer state (HTTP 409 Conflict), returns the server's newer state.
 */
export async function pushWorkspaceSyncState(state: PersistedStudioState): Promise<PushSyncResult> {
  if (isSyncing) return { ok: false };
  try {
    isSyncing = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(getSyncEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json().catch(() => null);

    if (res.ok) {
      lastPushedTimestamp = state.updatedAt || Date.now();
      return { ok: true };
    }

    if (res.status === 409 && data?.latestState) {
      return { ok: false, latestState: data.latestState as PersistedStudioState };
    }

    return { ok: false };
  } catch {
    return { ok: false };
  } finally {
    isSyncing = false;
  }
}

/**
 * Debounced push helper with state updates and automatic adoption of server-side newer state.
 */
export function debounceWorkspaceSyncPush(
  state: PersistedStudioState,
  onServerNewerState?: (newer: PersistedStudioState) => void,
  delayMs = 1000
): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
  }

  const stamped: PersistedStudioState = {
    ...state,
    updatedAt: Math.max(state.updatedAt || 0, lastPushedTimestamp, Date.now()),
  };

  pushTimer = window.setTimeout(async () => {
    const result = await pushWorkspaceSyncState(stamped);
    if (!result.ok && result.latestState && onServerNewerState) {
      onServerNewerState(result.latestState);
    }
  }, delayMs);
}
