/** localStorage access that never throws (private mode, full or blocked storage). */
const PREFIX = 'lern-app.';

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
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export interface Settings {
  sound: boolean;
}

export function loadSettings(): Settings {
  return { sound: true, ...readJson<Partial<Settings>>('settings.v1') };
}

export function saveSettings(s: Settings): void {
  writeJson('settings.v1', s);
}
