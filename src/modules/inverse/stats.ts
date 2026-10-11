import { SUGGESTION_PRIORITY, type ModuleStats, type Suggestion } from '../types';
import { Engine, FORMS, ROUND_TASKS, SESSION_GAP_MS, STAGES, formOf, levelOf, type Form, type Level, type Progress, type Stage } from './engine';

export const FORM_NAMES: Record<Form, string> = { 1: 'Zwei Schritte', 2: 'Eine Zeile', 3: 'Direkt' };
export const LEVEL_NAMES: Record<Level, string> = { 1: 'ohne Zehnerübergang', 2: 'glatte Zehner', 3: 'über den Zehner' };

/** "Zwei Schritte – glatte Zehner" */
export function stageName(stage: Stage): string {
  return `${FORM_NAMES[formOf(stage)]} – ${LEVEL_NAMES[levelOf(stage)]}`;
}

const FORM_BADGES: Record<Form, string> = {
  1: 'in zwei Schritten',
  2: 'in einer Zeile',
  3: 'direkt',
};
const LEVEL_BADGES: Record<Level, string> = {
  1: 'ohne Zehnerübergang',
  2: 'von glatten Zehnern aus',
  3: 'über den Zehner',
};

export function badgeName(stage: Stage): string {
  return `Umkehraufgaben ${FORM_BADGES[formOf(stage)]} ${LEVEL_BADGES[levelOf(stage)]} rechnest du schon sicher.`;
}

/** Days without practice after which the module is suggested for a refresh. */
export const REFRESH_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

function suggestionFor(engine: Engine, now: number): Suggestion {
  const p = engine.progress;
  const { continueRound, reviewDue, refresh, discover, practice } = SUGGESTION_PRIORITY;
  if (p.lastAnswered === null) return { priority: practice, label: 'Umkehraufgaben entdecken' };
  if (p.round.tasks > 0) return { priority: continueRound, label: 'Durchgang fortsetzen' };
  // A new session makes all queued reviews due within the first tasks.
  const newSession = now - p.lastActive > SESSION_GAP_MS;
  if (p.reviewQueue.some((r) => newSession || r.dueAt <= p.taskCounter + 1)) {
    return { priority: reviewDue, label: 'Bekanntes wieder üben' };
  }
  if (now - p.lastAnswered >= REFRESH_AFTER_MS) return { priority: refresh, label: 'Umkehraufgaben auffrischen' };
  if (STAGES.some((s) => engine.stageState(s).unlocked && engine.stageState(s).attempts === 0)) {
    return { priority: discover, label: 'Etwas Neues entdecken' };
  }
  return { priority: practice, label: 'Weiterüben' };
}

/** The newest stage still being learnt; otherwise one learnt but not yet secure. */
function nextGoal(engine: Engine): string {
  const open = STAGES.filter((s) => engine.stageState(s).unlocked && !engine.stageState(s).secure);
  const learning = open.filter((s) => !engine.stageState(s).ready);
  const candidates = learning.length ? learning : open;
  if (!candidates.length) return 'Alles sicher gelernt';
  return `Nächstes Ziel: ${stageName(candidates[candidates.length - 1])}`;
}

export function statsFromProgress(progress: Progress, now: number): ModuleStats {
  const engine = new Engine(progress);
  const p = engine.progress;
  const secure = STAGES.filter((s) => engine.stageState(s).secure);
  return {
    stars: engine.stars,
    trophies: p.trophies,
    badges: secure.map(badgeName),
    nextGoal: nextGoal(engine),
    goals: {
      done: secure.length,
      total: STAGES.length,
      label: `${secure.length} von ${STAGES.length} Lernzielen sicher`,
      // One sweet per way of writing, filled by its secure stages.
      sweets: FORMS.map((f) => secure.filter((s) => formOf(s) === f).length / 3),
    },
    round: p.round.tasks > 0 ? { done: p.round.tasks, target: ROUND_TASKS, unit: 'Aufgaben' } : null,
    started: p.lastAnswered !== null,
    lastPlayed: p.lastAnswered,
    suggestion: suggestionFor(engine, now),
  };
}
