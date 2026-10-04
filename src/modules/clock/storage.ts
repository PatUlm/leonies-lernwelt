import { readJson, remove, writeJson } from '../../shared/storage';
import { MASTERY_CORRECT, READY_MASTERY, SECURE_MASTERY, freshProgress, type Progress } from './engine';

const KEY = 'uhr.progress.v1';

/** Fields of earlier versions that are no longer used. */
interface LegacyFields {
  textBlock?: boolean[];
  textStep?: number;
  sideShares?: unknown;
}

export function loadProgress(now: number): Progress {
  const stored = readJson<Progress & LegacyFields>(KEY);
  if (stored?.version === 1 && stored.tracks?.digital?.length === 6) {
    // Fields added later get their defaults.
    const fresh = freshProgress(now);
    const { textBlock: _textBlock, textStep: _textStep, sideShares: _sideShares, ...rest } = stored;
    const progress: Progress = { ...fresh, ...rest, tracks: { ...fresh.tracks, ...stored.tracks } };
    if (stored.lastAnswered === undefined && stored.taskCounter > 0) progress.lastAnswered = stored.lastActive;
    // Mastery points replaced the day-based progress: derive them from the old state.
    for (const track of Object.keys(progress.tracks) as (keyof Progress['tracks'])[]) {
      for (const tier of progress.tracks[track]) {
        if (typeof tier.mastery === 'number') continue;
        const correct = (tier.window ?? []).filter((a) => a.ok).length * MASTERY_CORRECT;
        tier.mastery = tier.secure ? SECURE_MASTERY : tier.ready ? READY_MASTERY : Math.min(correct, READY_MASTERY - MASTERY_CORRECT);
      }
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
