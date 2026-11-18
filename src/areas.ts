import { articleModule } from './modules/articles';
import { clockModule } from './modules/clock';
import { englishModule } from './modules/english';
import { forestRulesModule } from './modules/forestrules';
import { howManyModule } from './modules/howmany';
import { inverseModule } from './modules/inverse';
import { leavesModule } from './modules/leaves';
import { notesModule } from './modules/notes';
import { treeModule } from './modules/tree';
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
  { id: 'mathe', title: 'Mathe', color: '#63b3ed', candy: lollipopCandy, modules: [clockModule, inverseModule] },
  { id: 'deutsch', title: 'Deutsch', color: '#f29bc1', candy: wrappedCandy, modules: [articleModule] },
  { id: 'musik', title: 'Musik', color: '#b39ddb', candy: cupcakeCandy, modules: [notesModule] },
  { id: 'hsu', title: 'HSU', subtitle: 'Heimat- und Sachunterricht', color: '#56c5b8', candy: gummyBear, modules: [treeModule, leavesModule, forestRulesModule] },
  { id: 'englisch', title: 'Englisch', color: '#cc9a76', candy: chocolateBar, modules: [englishModule, howManyModule] },
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

/** Every learning goal of the module is secure ("Sicher gelernt"). */
export function isMastered(entry: ModuleEntry): boolean {
  return entry.stats.goals.done === entry.stats.goals.total;
}

/**
 * The one module to suggest next: lowest suggestion priority; on a tie the one
 * not practised for the longest time (never practised counts as longest).
 * Mastered modules only count once every module is mastered.
 */
export function pickRecommendation(entries: ModuleEntry[]): ModuleEntry | null {
  const open = entries.filter((e) => !isMastered(e));
  let best: ModuleEntry | null = null;
  for (const entry of open.length ? open : entries) {
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

/** Orders calendar versions "YYYY.M.MICRO" numerically. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The modules of the latest release that brought modules ("Neu"). */
export function newModules(areas: Area[] = AREAS): Set<LearningModule> {
  const modules = areas.flatMap((a) => a.modules).filter((m) => m.addedIn);
  const latest = modules.reduce<string | null>(
    (max, m) => (max === null || compareVersions(m.addedIn!, max) > 0 ? m.addedIn! : max),
    null,
  );
  return new Set(modules.filter((m) => m.addedIn === latest));
}

/**
 * Areas for the dashboard: the one with the recommended module first, areas
 * with every module mastered last, otherwise in their fixed order.
 */
export function sortAreas(areas: Area[], entries: ModuleEntry[], recommended: ModuleEntry | null): Area[] {
  const rank = (area: Area) => {
    if (recommended?.area === area) return 0;
    const own = entries.filter((e) => e.area === area);
    return own.length && own.every(isMastered) ? 2 : 1;
  };
  return areas.map((area) => ({ area, rank: rank(area) })).sort((a, b) => a.rank - b.rank).map((x) => x.area);
}
