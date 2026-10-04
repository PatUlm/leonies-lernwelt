import type { Sound } from '../shared/sound';
import type { Settings } from '../shared/storage';

export interface ModuleContext {
  /** Back to the dashboard. */
  exit(): void;
  settings: Settings;
  saveSettings(): void;
  sound: Sound;
}

/** Rewards and progress a module reports to the dashboard. */
export interface ModuleStats {
  stars: number;
  trophies: number;
  /** Learning badges, phrased for the child. */
  badges: string[];
  /** Short progress line for the tile. */
  level: string;
}

/** A learning module shown as a tile on the dashboard. */
export interface LearningModule {
  /** Used as route: #/<id> */
  id: string;
  title: string;
  description: string;
  /** Inline SVG markup for the dashboard tile. */
  icon: string;
  stats(): ModuleStats;
  /** Renders into `root`; returns a cleanup function. */
  mount(root: HTMLElement, ctx: ModuleContext): () => void;
}
