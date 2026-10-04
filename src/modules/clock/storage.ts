import { readJson, remove, writeJson } from '../../shared/storage';
import { freshProgress, type Progress } from './engine';

const KEY = 'uhr.progress.v1';

export function loadProgress(now: number): Progress {
  const stored = readJson<Progress>(KEY);
  if (stored?.version === 1 && stored.tracks?.digital?.length === 6) {
    // Fields added later get their defaults.
    const progress = { ...freshProgress(now), ...stored };
    if (stored.lastAnswered === undefined && stored.taskCounter > 0) progress.lastAnswered = stored.lastActive;
    return progress;
  }
  return freshProgress(now);
}

export function saveProgress(p: Progress): void {
  writeJson(KEY, p);
}

export function clearProgress(): void {
  remove(KEY);
}
