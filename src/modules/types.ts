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
  /** Points earned in the current week (leaderboard). */
  weekPoints: number;
  /** Learning badges, phrased for the child. */
  badges: string[];
  /** Short progress line for the tile. */
  level: string;
  /** Learning goals reached so far, e.g. 2 of 6 clock tiers secure. */
  goals: { done: number; total: number; label: string };
  /** Points of a round in progress, if any. */
  round: { points: number; target: number } | null;
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
