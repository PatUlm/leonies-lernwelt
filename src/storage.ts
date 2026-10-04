import { freshProgress, type Progress } from './engine';

const KEY = 'uhr-lernen.progress.v1';
const SETTINGS_KEY = 'uhr-lernen.settings.v1';

export interface Settings {
  sound: boolean;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the game keeps working without persistence.
  }
}

export function loadProgress(now: number): Progress {
  const stored = read<Progress>(KEY);
  if (stored?.version === 1 && stored.tracks?.digital?.length === 6) return stored;
  return freshProgress(now);
}

export function saveProgress(p: Progress): void {
  write(KEY, p);
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function loadSettings(): Settings {
  return { sound: true, ...read<Partial<Settings>>(SETTINGS_KEY) };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}
