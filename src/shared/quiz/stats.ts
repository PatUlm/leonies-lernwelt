import { SUGGESTION_PRIORITY, type ModuleStats, type Suggestion } from '../../modules/types';
import type { QuizCourse } from './course';
import { Engine, ROUND_TASKS, SESSION_GAP_MS, stageNumbers, type Progress } from './engine';

/** Days without practice after which the module is suggested for a refresh. */
export const REFRESH_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

function suggestionFor(course: QuizCourse, engine: Engine, now: number): Suggestion {
  const p = engine.progress;
  const { continueRound, reviewDue, refresh, discover, practice } = SUGGESTION_PRIORITY;
  if (p.lastAnswered === null) return { priority: practice, label: `${course.object} entdecken` };
  if (p.round.tasks > 0) return { priority: continueRound, label: 'Durchgang fortsetzen' };
  // A new session makes all queued reviews due within the first tasks.
  const newSession = now - p.lastActive > SESSION_GAP_MS;
  if (p.reviewQueue.some((r) => newSession || r.dueAt <= p.taskCounter + 1)) {
    return { priority: reviewDue, label: 'Bekanntes wieder üben' };
  }
  if (now - p.lastAnswered >= REFRESH_AFTER_MS) return { priority: refresh, label: `${course.object} auffrischen` };
  if (engine.unlockedStages().some((s) => engine.stageState(s).attempts === 0)) {
    return { priority: discover, label: 'Etwas Neues entdecken' };
  }
  return { priority: practice, label: 'Weiterüben' };
}

/** The newest stage still being learnt; otherwise one learnt but not yet secure. */
function nextGoal(course: QuizCourse, engine: Engine): string {
  const open = engine.unlockedStages().filter((s) => !engine.stageState(s).secure);
  const learning = open.filter((s) => !engine.stageState(s).ready);
  const candidates = learning.length ? learning : open;
  if (!candidates.length) return 'Alles sicher gelernt';
  return `Nächstes Ziel: ${course.stages[candidates[candidates.length - 1] - 1].name}`;
}

export function statsFromProgress(course: QuizCourse, progress: Progress, now: number): ModuleStats {
  const engine = new Engine(course, progress);
  const p = engine.progress;
  const stages = stageNumbers(course);
  const secure = stages.filter((s) => engine.stageState(s).secure);
  return {
    stars: engine.stars,
    trophies: p.trophies,
    badges: secure.map((s) => course.stages[s - 1].badge),
    nextGoal: nextGoal(course, engine),
    goals: {
      done: secure.length,
      total: stages.length,
      label: `${secure.length} von ${stages.length} Lernzielen sicher`,
      sweets: stages.map((s) => (engine.stageState(s).secure ? 1 : 0)),
    },
    round: p.round.tasks > 0 ? { done: p.round.tasks, target: ROUND_TASKS, unit: 'Aufgaben' } : null,
    started: p.lastAnswered !== null,
    lastPlayed: p.lastAnswered,
    suggestion: suggestionFor(course, engine, now),
  };
}
