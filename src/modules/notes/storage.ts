import { readJson, remove, writeJson } from '../../shared/storage';
import { isValue } from './content';
import {
  EXAMPLES, MAX_MASTERY, RECENT_SPAN, STAGES, WINDOW, freshProgress, validKey,
  type Attempt, type ForcedTask, type Progress, type ReviewItem, type Stage, type StageState,
} from './engine';

const KEY = 'noten.progress.v1';

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
  if (!isRecord(v) || typeof v.value !== 'string' || !isValue(v.value)) return null;
  return { ok: bool(v.ok), value: v.value };
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
  if (!isRecord(v) || !isStage(v.stage) || typeof v.key !== 'string' || !validKey(v.stage, v.key)) return null;
  return { stage: v.stage, key: v.key, dueAt: num(v.dueAt, 0) };
}

function forcedTask(v: unknown): ForcedTask | null {
  if (!isRecord(v) || v.type !== 'example' || !isStage(v.stage)) return null;
  if (v.pick === undefined) return { type: 'example', stage: v.stage };
  const pick = v.pick;
  return typeof pick === 'number' && Number.isInteger(pick) && pick >= 0 && pick < EXAMPLES[v.stage].length
    ? { type: 'example', stage: v.stage, pick }
    : null;
}

/** "<stage>:<key>" of a recent task. */
function recentKey(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const stage = Number(v.slice(0, 1));
  return v.charAt(1) === ':' && isStage(stage) && validKey(stage, v.slice(2));
}

/**
 * Progress can come from another device via the server, so every field is
 * checked: only known fields with valid values are taken over.
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
    recent: list(raw.recent, RECENT_SPAN).filter(recentKey),
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
