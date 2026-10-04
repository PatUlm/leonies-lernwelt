import { SUGGESTION_PRIORITY, type ModuleStats, type Suggestion } from '../types';
import { Engine, SESSION_GAP_MS, TRACKS, type Progress, type Track } from './engine';
import { TIERS, type Tier } from './time';

export const TIER_NAMES: Record<Tier, string> = {
  1: 'volle Stunden',
  2: 'halbe Stunden',
  3: 'Viertelstunden',
  4: '10, 20, 40 und 50 Minuten',
  5: 'Fünf-Minuten-Schritte',
  6: 'einzelne Minuten',
};

export const BADGE_NAMES: Record<Track, Partial<Record<Tier, string>>> = {
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
  daytime: {
    1: 'Volle Stunden am Nachmittag (13 bis 18 Uhr) kennst du schon sicher.',
    2: 'Halbe Stunden am Nachmittag kennst du schon sicher.',
    3: 'Viertelstunden zu jeder Tageszeit kennst du schon sicher.',
  },
  set: {
    1: 'Volle Stunden stellst du schon sicher ein.',
    2: 'Halbe Stunden stellst du schon sicher ein.',
    3: 'Viertelstunden stellst du schon sicher ein.',
    4: '10, 20, 40 und 50 Minuten stellst du schon sicher ein.',
    5: 'Fünf-Minuten-Schritte stellst du schon sicher ein.',
    6: 'Sogar einzelne Minuten stellst du schon sicher ein!',
  },
  input: {
    1: 'Volle Stunden tippst du schon sicher ein.',
    2: 'Halbe Stunden tippst du schon sicher ein.',
    3: 'Viertelstunden tippst du schon sicher ein.',
    4: '10, 20, 40 und 50 Minuten tippst du schon sicher ein.',
    5: 'Fünf-Minuten-Schritte tippst du schon sicher ein.',
    6: 'Sogar einzelne Minuten tippst du schon sicher ein!',
  },
  halb: {
    4: '„zehn vor halb“ und „zehn nach halb“ sagst du schon sicher.',
    5: '„fünf vor halb“ und „fünf nach halb“ sagst du schon sicher.',
  },
  daySet: {
    1: 'Volle Stunden wie 21:00 stellst du schon sicher ein.',
    2: 'Halbe Stunden wie 21:30 stellst du schon sicher ein.',
    3: 'Viertelstunden wie 21:45 stellst du schon sicher ein.',
  },
  dayInput: {
    1: 'Volle Stunden mit Tageszeit tippst du schon sicher ein.',
    2: 'Halbe Stunden mit Tageszeit tippst du schon sicher ein.',
    3: 'Viertelstunden mit Tageszeit tippst du schon sicher ein.',
  },
};

/** Days without practice after which the clock is suggested for a refresh. */
export const REFRESH_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** Learning badges for all secure tiers. */
export function clockBadges(engine: Engine): string[] {
  return TRACKS.flatMap((track) =>
    TIERS.filter((t) => engine.tierState(track, t).secure).flatMap((t) => BADGE_NAMES[track][t] ?? []),
  );
}

function suggestionFor(engine: Engine, now: number): Suggestion {
  const p = engine.progress;
  const { continueRound, reviewDue, refresh, discover, practice } = SUGGESTION_PRIORITY;
  const lastAnswered = p.lastAnswered;
  if (lastAnswered === null) return { priority: practice, label: 'Uhr entdecken' };
  if (p.round.tasks > 0) return { priority: continueRound, label: 'Durchgang fortsetzen' };
  // A new session makes all queued reviews due within the first tasks.
  const newSession = now - p.lastActive > SESSION_GAP_MS;
  if (p.reviewQueue.some((r) => newSession || r.dueAt <= p.taskCounter + 1)) {
    return { priority: reviewDue, label: 'Bekanntes wieder üben' };
  }
  if (now - lastAnswered >= REFRESH_AFTER_MS) return { priority: refresh, label: 'Uhr auffrischen' };
  const untried = TRACKS.some((track) =>
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
  const started = p.lastAnswered !== null;
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
    lastPlayed: p.lastAnswered,
    suggestion: suggestionFor(engine, now),
  };
}
