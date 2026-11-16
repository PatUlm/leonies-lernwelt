import { readJson, remove, writeJson } from '../storage';
import {
  MAX_MASTERY, MAX_REVIEWS, RECENT_SPAN, WINDOW, exampleKeys, freshProgress, stageNumbers, validKey,
  type Attempt, type ForcedTask, type Progress, type QuizRules, type ReviewItem, type StageState,
} from './engine';

type Raw = Record<string, unknown>;

function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function list(v: unknown, max: number): unknown[] {
  return Array.isArray(v) ? v.slice(-max) : [];
}

/**
 * Progress can come from another device via the server, so every field is
 * checked: only known fields with valid values are taken over.
 */
export function sanitizeProgress(rules: QuizRules, input: unknown, now: number): Progress {
  const fresh = freshProgress(rules, now);
  if (!isRecord(input) || input.version !== 1) return fresh;
  const stages = stageNumbers(rules);
  const isStage = (v: unknown): v is number => typeof v === 'number' && stages.includes(v);

  const stageState = (v: unknown, stage: number): StageState => {
    const base = fresh.stages[stage - 1];
    if (!isRecord(v)) return base;
    const unlocked = stage === 1 || bool(v.unlocked, base.unlocked);
    const keys = exampleKeys(rules, stage);
    return {
      unlocked,
      steps: unlocked ? num(v.steps, 1, 1, rules.stages[stage - 1].steps.length) : 0,
      attempts: num(v.attempts, 0),
      window: list(v.window, WINDOW)
        .map((a): Attempt | null => (isRecord(a) && typeof a.key === 'string' && keys.includes(a.key) ? { ok: bool(a.ok), key: a.key } : null))
        .filter((a): a is Attempt => a !== null),
      mastery: num(v.mastery, 0, 0, MAX_MASTERY),
      ready: bool(v.ready),
      readySession: typeof v.readySession === 'number' ? num(v.readySession, 1, 1) : null,
      secure: bool(v.secure),
    };
  };

  const reviewItem = (v: unknown): ReviewItem | null => {
    if (!isRecord(v) || !isStage(v.stage) || typeof v.key !== 'string' || !validKey(rules, v.stage, v.key)) return null;
    return { stage: v.stage, key: v.key, dueAt: num(v.dueAt, 0) };
  };

  const forcedTask = (v: unknown): ForcedTask | null => {
    if (!isRecord(v) || v.type !== 'example' || !isStage(v.stage)) return null;
    if (v.pick === undefined) return { type: 'example', stage: v.stage };
    const index = v.pick;
    return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < exampleKeys(rules, v.stage).length
      ? { type: 'example', stage: v.stage, pick: index }
      : null;
  };

  /** "<stage>:<key>" of a recent task. */
  const recentKey = (v: unknown): v is string => {
    if (typeof v !== 'string') return false;
    const at = v.indexOf(':');
    return at > 0 && validKey(rules, Number(v.slice(0, at)), v.slice(at + 1));
  };

  const stored = Array.isArray(input.stages) ? input.stages : [];
  const round = isRecord(input.round) ? input.round : {};
  return {
    version: 1,
    session: num(input.session, 1, 1),
    lastActive: num(input.lastActive, now),
    lastAnswered: typeof input.lastAnswered === 'number' ? num(input.lastAnswered, 0) : null,
    taskCounter: num(input.taskCounter, 0),
    points: num(input.points, 0),
    correctTotal: num(input.correctTotal, 0),
    stages: stages.map((s) => stageState(stored[s - 1], s)),
    reviewQueue: list(input.reviewQueue, MAX_REVIEWS).map(reviewItem).filter((r): r is ReviewItem => r !== null),
    forced: list(input.forced, MAX_REVIEWS).map(forcedTask).filter((f): f is ForcedTask => f !== null),
    recent: list(input.recent, RECENT_SPAN).filter(recentKey),
    wrongStreak: num(input.wrongStreak, 0),
    correctStreak: num(input.correctStreak, 0),
    round: { tasks: num(round.tasks, 0), points: num(round.points, 0), correct: num(round.correct, 0) },
    trophies: num(input.trophies, 0),
  };
}

/** Local storage of one course's progress under `key`, e.g. "baum.progress.v1". */
export class QuizStore {
  constructor(
    private readonly rules: QuizRules,
    private readonly key: string,
  ) {}

  load(now: number): Progress {
    return sanitizeProgress(this.rules, readJson<unknown>(this.key), now);
  }

  save(p: Progress): void {
    writeJson(this.key, p);
  }

  clear(): void {
    remove(this.key);
  }
}
