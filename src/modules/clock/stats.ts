import { SUGGESTION_PRIORITY, type ModuleStats, type Suggestion } from '../types';
import { Engine, SESSION_GAP_MS, SIDE_TRACKS, TRACK_TIERS, TRACKS, type Progress, type Track } from './engine';
import { TIERS, type Tier } from './time';

/** The tracks as named for parents and on the tile. */
export const TRACK_NAMES: Record<Track, string> = {
  digital: 'Zahl',
  text: 'Text',
  daytime: '24-Stunden-Zeiten lesen',
  set: 'Zeiger stellen',
  input: 'Eintippen',
  halb: 'vor/nach halb',
  daySet: 'Zeiger zu 24-Stunden-Zeiten stellen',
  dayInput: '24-Stunden-Zeiten eintippen',
};

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
    1: 'Volle Stunden wie 21:00 Uhr stellst du schon sicher ein.',
    2: 'Halbe Stunden wie 21:30 Uhr stellst du schon sicher ein.',
    3: 'Viertelstunden wie 21:45 Uhr stellst du schon sicher ein.',
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

/** The tile's sweets: one per track, in the order the tracks are introduced. */
const SWEET_TRACKS: readonly Track[] = ['digital', ...SIDE_TRACKS];

/** "halbe Stunden"; the "vor/nach halb" tiers by their phrase. */
function tierName(track: Track, tier: Tier): string {
  if (track === 'halb') return tier === 4 ? '„zehn vor halb“' : '„fünf vor halb“';
  return TIER_NAMES[tier];
}

/**
 * The tier to name as the next goal: one still being learnt, the most
 * advanced first; otherwise one that is learnt but not yet secure.
 */
function nextGoal(engine: Engine): string {
  const cells = SWEET_TRACKS.flatMap((track) => TRACK_TIERS[track].map((tier) => ({ track, tier, s: engine.tierState(track, tier) })));
  if (cells.every((c) => c.s.secure)) return 'Alles sicher gelernt';
  const open = cells.filter((c) => c.s.unlocked && !c.s.secure);
  const learning = open.filter((c) => !c.s.ready);
  const candidates = learning.length ? learning : open;
  // Everything open is secure: the next answers unlock something new.
  if (!candidates.length) return 'Nächstes Ziel: etwas Neues entdecken';
  const goal = candidates.reduce((a, b) => (b.s.mastery > a.s.mastery ? b : a));
  return `Nächstes Ziel: ${TRACK_NAMES[goal.track]} – ${tierName(goal.track, goal.tier)}`;
}

/** Whether every tier of the track is secure (a completed skill). */
export function trackSecure(engine: Engine, track: Track): boolean {
  return TRACK_TIERS[track].every((t) => engine.tierState(track, t).secure);
}

export function statsFromProgress(progress: Progress, now: number): ModuleStats {
  const engine = new Engine(progress);
  const p = engine.progress;
  const started = p.lastAnswered !== null;
  const sweets = SWEET_TRACKS.map((track) => TRACK_TIERS[track].filter((t) => engine.tierState(track, t).secure).length / TRACK_TIERS[track].length);
  const secure = SWEET_TRACKS.reduce((n, track) => n + TRACK_TIERS[track].filter((t) => engine.tierState(track, t).secure).length, 0);
  const total = SWEET_TRACKS.reduce((n, track) => n + TRACK_TIERS[track].length, 0);
  return {
    stars: engine.stars,
    trophies: p.trophies,
    badges: clockBadges(engine),
    nextGoal: nextGoal(engine),
    goals: { done: secure, total, label: `${secure} von ${total} Lernzielen sicher`, sweets },
    round: p.round.tasks > 0 ? { done: p.round.points, target: p.round.target, unit: 'Punkte' } : null,
    started,
    lastPlayed: p.lastAnswered,
    suggestion: suggestionFor(engine, now),
  };
}
