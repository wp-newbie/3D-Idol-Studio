import type { PersistedStudioState, Persona } from '../types/studio';
import { createSeedPersonas, DEFAULT_SETTINGS } from '../data/presets';
import {
  loadMemoryJournalFromLocalStorage,
  saveMemoryJournalToLocalStorage,
} from './memoryJournal';
import { fetchWorkspaceSyncState } from './workspaceSync';

const DB_NAME = 'zeta-idol-studio-state-db';
const DB_VERSION = 1;
const STORE_NAME = 'studio_kv';
const STATE_KEY = 'root_state_v1';

function openStateDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readIdbState(): Promise<PersistedStudioState | null> {
  try {
    const db = await openStateDb();
    const value = await new Promise<PersistedStudioState | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
      req.onsuccess = () => resolve(req.result as PersistedStudioState | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value ?? null;
  } catch (err) {
    console.warn('[StudioStore] IndexedDB read failed:', err);
    return null;
  }
}

async function writeIdbState(state: PersistedStudioState): Promise<void> {
  try {
    const db = await openStateDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(state, STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[StudioStore] IndexedDB write failed:', err);
  }
}

function hydratePersonaDefaults(p: Persona, seedMap: Map<string, Persona>): Persona {
  const seed = seedMap.get(p.id);
  const clampedPitch = Math.max(0.85, Math.min(1.45, p.voice?.pitch ?? 1.25));
  const clampedSpeed = Math.max(0.9, Math.min(1.25, p.voice?.speed ?? 1.12));

  // Merge localStorage Core Memory Journal with stored persona memories
  const lsMemories = loadMemoryJournalFromLocalStorage(p.id);
  const baseMemories =
    lsMemories.length > 0
      ? lsMemories
      : Array.isArray(p.memoryJournal) && p.memoryJournal.length > 0
      ? p.memoryJournal
      : seed?.memoryJournal ?? [];

  return {
    ...p,
    traits: p.traits ?? seed?.traits ?? 'Classic Japanese Tsundere, Expressive, Guarded',
    startingScenario:
      p.startingScenario ??
      seed?.startingScenario ??
      'Late evening inside the dark-glass 3D virtual idol studio with {{user}}.',
    emotionIntensity:
      typeof p.emotionIntensity === 'number'
        ? Math.max(0.15, Math.min(1, p.emotionIntensity))
        : seed?.emotionIntensity ?? 0.72,
    affinity:
      typeof p.affinity === 'number'
        ? Math.max(0, Math.min(100, p.affinity))
        : seed?.affinity ?? 20,
    brain: p.brain
      ? {
          energy: Math.max(0, Math.min(100, p.brain.energy ?? 80)),
          hunger: Math.max(0, Math.min(100, p.brain.hunger ?? 28)),
          sleepiness: Math.max(0, Math.min(100, p.brain.sleepiness ?? 20)),
          boredom: Math.max(0, Math.min(100, p.brain.boredom ?? 25)),
          comfort: Math.max(0, Math.min(100, p.brain.comfort ?? 78)),
          curiosity: Math.max(0, Math.min(100, p.brain.curiosity ?? 50)),
          isSleeping: Boolean(p.brain.isSleeping),
          nuancedFeeling:
            p.brain.nuancedFeeling || seed?.brain.nuancedFeeling || 'Calm & Guarded',
          carryover: p.brain.carryover ?? null,
          currentThought:
            p.brain.currentThought ||
            seed?.brain.currentThought ||
            "He's been quiet for a while... not that I care!",
          thoughtStream: Array.isArray(p.brain.thoughtStream) ? p.brain.thoughtStream : [],
          lastAutonomousActionAt: p.brain.lastAutonomousActionAt ?? 0,
        }
      : seed?.brain ?? {
          energy: 80,
          hunger: 28,
          sleepiness: 20,
          boredom: 25,
          comfort: 78,
          curiosity: 50,
          isSleeping: false,
          nuancedFeeling: 'Calm & Guarded',
          carryover: null,
          currentThought: "He's been quiet for a while... not that I care!",
          thoughtStream: [],
          lastAutonomousActionAt: 0,
        },
    memoryJournal: baseMemories,
    lastMemorySummaryMsgCount:
      typeof p.lastMemorySummaryMsgCount === 'number' ? p.lastMemorySummaryMsgCount : 0,
    stageEnvironment: p.stageEnvironment ?? seed?.stageEnvironment ?? 'sunlit_boutique',
    customEnvironment: p.customEnvironment ?? null,
    pendingSystemEvents: Array.isArray(p.pendingSystemEvents) ? p.pendingSystemEvents : [],
    voice: {
      ...p.voice,
      pitch: clampedPitch,
      speed: clampedSpeed,
    },
    outfitSlots: Array.isArray(p.outfitSlots)
      ? p.outfitSlots.map((slot) => ({
          ...slot,
          yawOffset:
            slot.modelVaultId === null
              ? 0
              : typeof slot.yawOffset === 'number' && Number.isFinite(slot.yawOffset)
                ? slot.yawOffset
                : 0,
          proceduralAccessories: Array.isArray(slot.proceduralAccessories)
            ? slot.proceduralAccessories
            : [],
        }))
      : seed?.outfitSlots ?? [],
  };
}

export function createDefaultStudioState(): PersistedStudioState {
  const personas = createSeedPersonas();
  return {
    version: 3,
    activePersonaId: personas[0].id,
    personas,
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: Date.now(),
  };
}

export async function loadStudioState(): Promise<{
  state: PersistedStudioState;
  backend: 'electron-disk+idb' | 'indexeddb';
}> {
  let diskState: PersistedStudioState | null = null;
  if (window.studioAPI?.readState) {
    try {
      const raw = await window.studioAPI.readState();
      if (raw && typeof raw === 'object' && Array.isArray((raw as PersistedStudioState).personas)) {
        diskState = raw as PersistedStudioState;
      }
    } catch {
      diskState = null;
    }
  }

  const idbState = await readIdbState();
  const syncState = await fetchWorkspaceSyncState();

  const candidates = [syncState, diskState, idbState].filter(
    (c): c is PersistedStudioState => Boolean(c && Array.isArray(c.personas) && c.personas.length > 0)
  );

  let chosen: PersistedStudioState | null = null;
  if (candidates.length > 0) {
    chosen = candidates.reduce((best, curr) =>
      (curr.updatedAt ?? 0) > (best.updatedAt ?? 0) ? curr : best
    );
  }

  if (!chosen || !chosen.personas || chosen.personas.length === 0) {
    const fresh = createDefaultStudioState();
    await saveStudioState(fresh);
    return {
      state: fresh,
      backend: window.studioAPI?.isElectron ? 'electron-disk+idb' : 'indexeddb',
    };
  }

  const seeds = createSeedPersonas();
  const seedMap = new Map(seeds.map((s) => [s.id, s]));

  const envKey = typeof __ENV_GEMINI_API_KEY__ !== 'undefined' ? __ENV_GEMINI_API_KEY__ : '';
  const rawTtsModel = chosen.settings?.ttsModel?.trim() || '';
  const migratedTtsModel = rawTtsModel || 'gemini-2.5-flash-preview-tts';
  const rawTextModel = chosen.settings?.textModel?.trim() || '';
  const migratedTextModel =
    !rawTextModel || rawTextModel === 'gemini-2.5-flash'
      ? 'gemini-flash-latest'
      : rawTextModel;
  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    ...chosen.settings,
    apiKey: chosen.settings?.apiKey || envKey,
    enableGeminiCloud:
      chosen.settings?.enableGeminiCloud !== undefined
        ? chosen.settings.enableGeminiCloud
        : true,
    textModel: migratedTextModel,
    ttsModel: migratedTtsModel,
  };

  const hydratedPersonas = chosen.personas.map((p) => hydratePersonaDefaults(p, seedMap));
  const activeExists = hydratedPersonas.some((p) => p.id === chosen.activePersonaId);

  return {
    state: {
      ...chosen,
      version: 3,
      activePersonaId: activeExists ? chosen.activePersonaId : hydratedPersonas[0].id,
      personas: hydratedPersonas,
      settings: mergedSettings,
    },
    backend: window.studioAPI?.isElectron ? 'electron-disk+idb' : 'indexeddb',
  };
}

export async function saveStudioState(state: PersistedStudioState): Promise<void> {
  const stamped: PersistedStudioState = {
    ...state,
    version: 3,
    updatedAt: state.updatedAt || Date.now(),
  };

  // Persist each persona's Memory Journal to localStorage
  for (const p of stamped.personas) {
    saveMemoryJournalToLocalStorage(p.id, p.memoryJournal || []);
  }

  await writeIdbState(stamped);
  if (window.studioAPI?.writeState) {
    try {
      await window.studioAPI.writeState(stamped);
    } catch (err) {
      console.warn('[StudioStore] Electron disk write failed:', err);
    }
  }
}
