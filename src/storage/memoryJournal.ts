import type { MemoryEntry } from '../types/studio';

const MEMORY_KEY_PREFIX = 'zeta_idol_memory_journal_v1_';

export function loadMemoryJournalFromLocalStorage(personaId: string): MemoryEntry[] {
  try {
    const raw = window.localStorage.getItem(`${MEMORY_KEY_PREFIX}${personaId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is MemoryEntry =>
        Boolean(item && typeof item.id === 'string' && typeof item.fact === 'string')
    );
  } catch {
    return [];
  }
}

export function saveMemoryJournalToLocalStorage(
  personaId: string,
  entries: MemoryEntry[]
): void {
  try {
    window.localStorage.setItem(
      `${MEMORY_KEY_PREFIX}${personaId}`,
      JSON.stringify(entries.slice(-30))
    );
  } catch (err) {
    console.warn('[MemoryJournal] Failed to write localStorage:', err);
  }
}
