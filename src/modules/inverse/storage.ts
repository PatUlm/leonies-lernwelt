import { readJson, remove, writeJson } from '../../shared/storage';
import {
  MAX_MASTERY, RECENT_SPAN, STAGES, WINDOW, freshProgress, levelOfProblem,
  type Attempt, type ForcedTask, type Progress, type ReviewItem, type Stage, type StageState,
} from './engine';

const KEY = 'umkehr.progress.v1';

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

function isStage(v: unknown): v is Stage {
  return typeof v === 'number' && (STAGES as readonly number[]).includes(v);
}

function attempt(v: unknown): Attempt | null {
  if (!isRecord(v) || typeof v.total !== 'number' || typeof v.part !== 'number' || levelOfProblem(v.total, v.part) === null) return null;
  return { ok: bool(v.ok), total: v.total, part: v.part };
}

function stageState(v: unknown, fresh: StageState): StageState {
  if (!isRecord(v)) return fresh;
  return {
    unlocked: bool(v.unlocked, fresh.unlocked),
    attempts: num(v.attempts, 0),
    window: list(v.window, WINDOW).map(attempt).filter((a): a is Attempt => a !== null),
    mastery: num(v.mastery, 0, 0, MAX_MASTERY),
    ready: bool(v.ready),
    readySession: typeof v.readySession === 'number' ? num(v.readySession, 1, 1) : null,
    secure: bool(v.secure),
  };
}

function reviewItem(v: unknown): ReviewItem | null {
  if (!isRecord(v) || !isStage(v.stage) || typeof v.key !== 'string' || v.key.length > 12) return null;
  return { stage: v.stage, key: v.key, dueAt: num(v.dueAt, 0) };
}

function forcedTask(v: unknown): ForcedTask | null {
  if (!isRecord(v)) return null;
  if (v.type === 'back') return { type: 'back' };
  if (v.type === 'easy') return isStage(v.stage) ? { type: 'easy', stage: v.stage } : { type: 'easy' };
  if (v.type !== 'example' || !isStage(v.stage)) return null;
  const pick = v.pick;
  return typeof pick !== 'number' || !Number.isInteger(pick) || pick < 0 ? { type: 'example', stage: v.stage } : { type: 'example', stage: v.stage, pick };
}

/**
 * Progress can come from another device via the server, so every field is
 * checked: only known fields with valid values are taken over. Review keys
 * that do not fit their stage are dropped later by the engine.
 */
export function sanitizeProgress(raw: unknown, now: number): Progress {
  const fresh = freshProgress(now);
  if (!isRecord(raw) || raw.version !== 1) return fresh;
  const stored = Array.isArray(raw.stages) ? raw.stages : [];
  const round = isRecord(raw.round) ? raw.round : {};
  return {
    version: 1,
    session: num(raw.session, 1, 1),
    lastActive: num(raw.lastActive, now),
    lastAnswered: typeof raw.lastAnswered === 'number' ? num(raw.lastAnswered, 0) : null,
    taskCounter: num(raw.taskCounter, 0),
    points: num(raw.points, 0),
    correctTotal: num(raw.correctTotal, 0),
    stages: STAGES.map((s) => stageState(stored[s - 1], fresh.stages[s - 1])),
    reviewQueue: list(raw.reviewQueue, 12).map(reviewItem).filter((r): r is ReviewItem => r !== null),
    forced: list(raw.forced, 12).map(forcedTask).filter((f): f is ForcedTask => f !== null),
    recent: list(raw.recent, RECENT_SPAN).filter((r): r is number => typeof r === 'number' && Number.isInteger(r) && r > 0 && r <= 100),
    newestRun: num(raw.newestRun, 0),
    backShown: bool(raw.backShown),
    wrongStreak: num(raw.wrongStreak, 0),
    correctStreak: num(raw.correctStreak, 0),
    round: { tasks: num(round.tasks, 0), points: num(round.points, 0), correct: num(round.correct, 0) },
    trophies: num(raw.trophies, 0),
  };
}

export function loadProgress(now: number): Progress {
  return sanitizeProgress(readJson<unknown>(KEY), now);
}

export function saveProgress(p: Progress): void {
  writeJson(KEY, p);
}

export function clearProgress(): void {
  remove(KEY);
}
