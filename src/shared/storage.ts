/** localStorage access that never throws (private mode, full or blocked storage). */
const PREFIX = 'lernwelt.';

/** Keys that stay on this device and are never synced (account, sync bookkeeping). */
export const LOCAL_ONLY_KEYS = new Set(['account.v1', 'sync.v1']);

type WriteListener = (key: string) => void;
const writeListeners = new Set<WriteListener>();

/** Notified after every change of a synced key (used to upload the progress). */
export function onWrite(fn: WriteListener): () => void {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}

function notify(key: string): void {
  if (LOCAL_ONLY_KEYS.has(key)) return;
  for (const fn of writeListeners) fn(key);
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // The app keeps working without persistence.
  }
  notify(key);
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
  notify(key);
}

/** All synced entries (everything except LOCAL_ONLY_KEYS). */
export function syncedEntries(): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full?.startsWith(PREFIX)) continue;
      const key = full.slice(PREFIX.length);
      if (!LOCAL_ONLY_KEYS.has(key)) entries[key] = readJson(key);
    }
  } catch {
    // no storage
  }
  return entries;
}

/** Replaces all synced entries without notifying (data coming from the server). */
export function replaceSyncedEntries(entries: Record<string, unknown>): void {
  try {
    for (const key of Object.keys(syncedEntries())) localStorage.removeItem(PREFIX + key);
    for (const [key, value] of Object.entries(entries)) {
      if (!LOCAL_ONLY_KEYS.has(key)) localStorage.setItem(PREFIX + key, JSON.stringify(value));
    }
  } catch {
    // no storage
  }
}

export interface Settings {
  sound: boolean;
  /** Now and then hide the answers until the child has said the time aloud. */
  sayFirst: boolean;
}

export function loadSettings(): Settings {
  return { sound: true, sayFirst: true, ...readJson<Partial<Settings>>('settings.v1') };
}

export function saveSettings(s: Settings): void {
  writeJson('settings.v1', s);
}
