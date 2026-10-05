import type { Sound } from '../shared/sound';
import type { Settings } from '../shared/storage';

export interface ModuleContext {
  /** Back to the module's learning area. */
  exit(): void;
  /** Label for the way back, e.g. "Zur Mathe-Auswahl". */
  exitLabel: string;
  settings: Settings;
  saveSettings(): void;
  sound: Sound;
  /** Points just earned; counted on the server for the weekly leaderboard. */
  addPoints(points: number): void;
}

/**
 * Why a module should be practised next. Lower priority wins; only one module
 * in the whole app is recommended at a time.
 */
export const SUGGESTION_PRIORITY = {
  /** A started round is waiting to be finished. */
  continueRound: 1,
  /** Earlier mistakes are due for repetition. */
  reviewDue: 2,
  /** Not practised for a few days. */
  refresh: 3,
  /** Something new was unlocked and not tried yet. */
  discover: 4,
  /** Default: keep going, or start for the first time. */
  practice: 5,
} as const;

export type SuggestionPriority = (typeof SUGGESTION_PRIORITY)[keyof typeof SUGGESTION_PRIORITY];

export interface Suggestion {
  priority: SuggestionPriority;
  /** Shown on the "Hier weiter" badge, e.g. "Durchgang fortsetzen". */
  label: string;
}

/** Rewards and progress a module reports to the dashboard and its area. */
export interface ModuleStats {
  stars: number;
  trophies: number;
  /** Learning badges, phrased for the child. */
  badges: string[];
  /** What to practise next, for the tile: "Nächstes Ziel: Zeiger stellen – halbe Stunden". */
  nextGoal: string;
  /**
   * Learning goals secure so far, counting all of them (8 of 35 for the clock),
   * so the tile only looks finished when everything is secure. `sweets`: the
   * sweets on the tile, each filled from 0 to 1.
   */
  goals: { done: number; total: number; label: string; sweets: number[] };
  /** A round in progress, if any: e.g. 40 of 120 "Punkte" or 4 of 10 "Aufgaben". */
  round: { done: number; target: number; unit: string } | null;
  started: boolean;
  /** Epoch ms of the last practice, null if never. */
  lastPlayed: number | null;
  suggestion: Suggestion;
}

/** A learning module, chosen inside its learning area. */
export interface LearningModule {
  /** Used as route: #/<area>/<id> */
  id: string;
  title: string;
  description: string;
  /** Inline SVG markup for the module card. */
  icon: string;
  stats(): ModuleStats;
  /** Renders into `root`; returns a cleanup function. */
  mount(root: HTMLElement, ctx: ModuleContext): () => void;
}
