import { SUGGESTION_PRIORITY, type ModuleStats, type Suggestion } from '../types';
import { Engine, ROUND_TASKS, SESSION_GAP_MS, STAGES, type Progress, type Stage } from './engine';

export const STAGE_NAMES: Record<Stage, string> = {
  1: 'der, die oder das?',
  2: 'ein oder eine?',
  3: 'Nomen entdecken',
  4: 'Kennen wir es schon?',
};

export const BADGE_NAMES: Record<Stage, string> = {
  1: '„der, die, das“ kennst du schon sicher.',
  2: '„ein“ und „eine“ setzt du schon sicher ein.',
  3: 'Nomen findest du schon sicher.',
  4: 'Bestimmter oder unbestimmter Artikel? Das weißt du schon sicher!',
};

/** Days without practice after which the module is suggested for a refresh. */
export const REFRESH_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

function suggestionFor(engine: Engine, now: number): Suggestion {
  const p = engine.progress;
  const { continueRound, reviewDue, refresh, discover, practice } = SUGGESTION_PRIORITY;
  if (p.lastAnswered === null) return { priority: practice, label: 'Artikel entdecken' };
  if (p.round.tasks > 0) return { priority: continueRound, label: 'Durchgang fortsetzen' };
  // A new session makes all queued reviews due within the first tasks.
  const newSession = now - p.lastActive > SESSION_GAP_MS;
  if (p.reviewQueue.some((r) => newSession || r.dueAt <= p.taskCounter + 1)) {
    return { priority: reviewDue, label: 'Bekanntes wieder üben' };
  }
  if (now - p.lastAnswered >= REFRESH_AFTER_MS) return { priority: refresh, label: 'Artikel auffrischen' };
  if (STAGES.some((s) => engine.stageState(s).unlocked && engine.stageState(s).attempts === 0)) {
    return { priority: discover, label: 'Etwas Neues entdecken' };
  }
  return { priority: practice, label: 'Weiterüben' };
}

/** A stage still being learnt, the most advanced first; otherwise one learnt but not yet secure. */
function nextGoal(engine: Engine): string {
  const open = STAGES.filter((s) => engine.stageState(s).unlocked && !engine.stageState(s).secure);
  const learning = open.filter((s) => !engine.stageState(s).ready);
  const candidates = learning.length ? learning : open;
  if (!candidates.length) return 'Alles sicher gelernt';
  const goal = candidates.reduce((a, b) => (engine.stageState(b).mastery > engine.stageState(a).mastery ? b : a));
  return `Nächstes Ziel: ${STAGE_NAMES[goal]}`;
}

export function statsFromProgress(progress: Progress, now: number): ModuleStats {
  const engine = new Engine(progress);
  const p = engine.progress;
  const started = p.lastAnswered !== null;
  const secure = STAGES.filter((s) => engine.stageState(s).secure);
  return {
    stars: engine.stars,
    trophies: p.trophies,
    badges: secure.map((s) => BADGE_NAMES[s]),
    nextGoal: nextGoal(engine),
    goals: {
      done: secure.length,
      total: STAGES.length,
      label: `${secure.length} von ${STAGES.length} Lernzielen sicher`,
      sweets: STAGES.map((s) => (engine.stageState(s).secure ? 1 : 0)),
    },
    round: p.round.tasks > 0 ? { done: p.round.tasks, target: ROUND_TASKS, unit: 'Aufgaben' } : null,
    started,
    lastPlayed: p.lastAnswered,
    suggestion: suggestionFor(engine, now),
  };
}
