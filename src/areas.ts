import { clockModule } from './modules/clock';
import type { LearningModule, ModuleStats } from './modules/types';
import { chocolateBar, cupcakeCandy, gummyBear, lollipopCandy, wrappedCandy } from './shared/candy';

/** A learning area (school subject), shown as its own sweet in a fixed colour. */
export interface Area {
  /** Used as route: #/<id> */
  id: string;
  title: string;
  /** Spelled-out name where the title is an abbreviation. */
  subtitle?: string;
  color: string;
  candy: (color: string) => string;
  modules: LearningModule[];
}

export const AREAS: Area[] = [
  { id: 'mathe', title: 'Mathe', color: '#63b3ed', candy: lollipopCandy, modules: [clockModule] },
  { id: 'deutsch', title: 'Deutsch', color: '#f29bc1', candy: wrappedCandy, modules: [] },
  { id: 'musik', title: 'Musik', color: '#b39ddb', candy: cupcakeCandy, modules: [] },
  { id: 'hsu', title: 'HSU', subtitle: 'Heimat- und Sachunterricht', color: '#56c5b8', candy: gummyBear, modules: [] },
  { id: 'englisch', title: 'Englisch', color: '#b98260', candy: chocolateBar, modules: [] },
];

export interface ModuleEntry {
  area: Area;
  module: LearningModule;
  stats: ModuleStats;
}

/** Stats of every available module, read once per screen. */
export function collectModules(areas: Area[] = AREAS): ModuleEntry[] {
  return areas.flatMap((area) => area.modules.map((module) => ({ area, module, stats: module.stats() })));
}

/**
 * The one module to suggest next: lowest suggestion priority; on a tie the one
 * not practised for the longest time (never practised counts as longest).
 */
export function pickRecommendation(entries: ModuleEntry[]): ModuleEntry | null {
  let best: ModuleEntry | null = null;
  for (const entry of entries) {
    if (!best) {
      best = entry;
      continue;
    }
    const a = entry.stats;
    const b = best.stats;
    if (a.suggestion.priority !== b.suggestion.priority) {
      if (a.suggestion.priority < b.suggestion.priority) best = entry;
    } else if ((a.lastPlayed ?? -Infinity) < (b.lastPlayed ?? -Infinity)) {
      best = entry;
    }
  }
  return best;
}
