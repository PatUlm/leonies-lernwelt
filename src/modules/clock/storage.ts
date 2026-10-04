import { readJson, remove, writeJson } from '../../shared/storage';
import { freshProgress, type Progress } from './engine';

const KEY = 'uhr.progress.v1';

/** Fields of earlier versions that were replaced. */
interface LegacyFields {
  textBlock?: boolean[];
  textStep?: number;
}

export function loadProgress(now: number): Progress {
  const stored = readJson<Progress & LegacyFields>(KEY);
  if (stored?.version === 1 && stored.tracks?.digital?.length === 6) {
    // Fields added later get their defaults.
    const fresh = freshProgress(now);
    const { textBlock, textStep, ...rest } = stored;
    const progress: Progress = { ...fresh, ...rest, tracks: { ...fresh.tracks, ...stored.tracks } };
    if (stored.lastAnswered === undefined && stored.taskCounter > 0) progress.lastAnswered = stored.lastActive;
    if (!stored.sideShares) {
      progress.sideShares = { ...fresh.sideShares, text: { block: textBlock ?? [], step: textStep ?? 0 } };
    }
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
