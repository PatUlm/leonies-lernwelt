import { SUGGESTION_PRIORITY, type ModuleStats, type Suggestion } from '../types';
import { Engine, type Progress, type Track } from './engine';
import { TIERS, type Tier } from './time';

export const TIER_NAMES: Record<Tier, string> = {
  1: 'volle Stunden',
  2: 'halbe Stunden',
  3: 'Viertelstunden',
  4: '10, 20, 40 und 50 Minuten',
  5: 'Fünf-Minuten-Schritte',
  6: 'einzelne Minuten',
};

export const BADGE_NAMES: Record<Track, Record<Tier, string>> = {
  digital: {
    1: 'Volle Stunden erkennst du schon sicher.',
    2: 'Halbe Stunden erkennst du schon sicher.',
    3: 'Viertelstunden erkennst du schon sicher.',
    4: '10, 20, 40 und 50 Minuten liest du schon sicher.',
    5: 'Fünf-Minuten-Schritte liest du schon sicher.',
    6: 'Sogar einzelne Minuten liest du schon sicher!',
  },
  text: {
    1: '„… Uhr“ sagst du schon sicher.',
    2: '„halb …“ sagst du schon sicher.',
    3: '„Viertel nach“ und „Viertel vor“ sagst du schon sicher.',
    4: '„zehn nach“ und „zwanzig vor“ sagst du schon sicher.',
    5: '„fünf nach“ und „fünf vor“ sagst du schon sicher.',
    6: 'Einzelne Minuten in Worten sagst du schon sicher!',
  },
};

/** Days without practice after which the clock is suggested for a refresh. */
export const REFRESH_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** Learning badges for all secure tiers. */
export function clockBadges(engine: Engine): string[] {
  return (['digital', 'text'] as const).flatMap((track) =>
    TIERS.filter((t) => engine.tierState(track, t).secure).map((t) => BADGE_NAMES[track][t]),
  );
}

function suggestionFor(engine: Engine, now: number): Suggestion {
  const p = engine.progress;
  const { continueRound, reviewDue, refresh, discover, practice } = SUGGESTION_PRIORITY;
  if (p.taskCounter === 0) return { priority: practice, label: 'Uhr entdecken' };
  if (p.round.tasks > 0) return { priority: continueRound, label: 'Durchgang fortsetzen' };
  if (p.reviewQueue.length > 0) return { priority: reviewDue, label: 'Bekanntes wieder üben' };
  if (now - p.lastActive >= REFRESH_AFTER_MS) return { priority: refresh, label: 'Uhr auffrischen' };
  const untried = (['digital', 'text'] as const).some((track) =>
    TIERS.some((t) => {
      const s = engine.tierState(track, t);
      return s.unlocked && s.attempts === 0;
    }),
  );
  if (untried) return { priority: discover, label: 'Etwas Neues entdecken' };
  return { priority: practice, label: 'Weiterüben' };
}

export function statsFromProgress(progress: Progress, now: number): ModuleStats {
  const engine = new Engine(progress);
  const p = engine.progress;
  const started = p.taskCounter > 0;
  const digital = engine.unlockedTiers('digital');
  const newest = digital[digital.length - 1];
  const secure = TIERS.filter((t) => engine.tierState('digital', t).secure).length;
  return {
    stars: engine.stars,
    trophies: p.trophies,
    badges: clockBadges(engine),
    level: started ? `Stufe ${newest} von 6: ${TIER_NAMES[newest]}` : 'Noch nicht gestartet',
    goals: { done: secure, total: TIERS.length, label: `${secure} von ${TIERS.length} Stufen sicher` },
    round: p.round.tasks > 0 ? { points: p.round.points, target: p.round.target } : null,
    started,
    lastPlayed: started ? p.lastActive : null,
    suggestion: suggestionFor(engine, now),
  };
}
