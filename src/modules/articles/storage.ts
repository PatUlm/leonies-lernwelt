import { readJson, remove, writeJson } from '../../shared/storage';
import {
  INTRO_MASTERY, MAX_MASTERY, SENTENCE_EXAMPLE, STAGES, WINDOW, freshProgress,
  type Attempt, type ForcedTask, type Progress, type ReviewItem, type Stage, type StageState,
} from './engine';

const KEY = 'artikel.progress.v1';

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

function str(v: unknown, max = 40): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function isStage(v: unknown): v is Stage {
  return typeof v === 'number' && (STAGES as readonly number[]).includes(v);
}

function attempt(v: unknown): Attempt | null {
  return isRecord(v) && str(v.word) ? { ok: bool(v.ok), word: v.word } : null;
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
  if (!isRecord(v) || !isStage(v.stage) || !str(v.key)) return null;
  return { stage: v.stage, key: v.key, dueAt: num(v.dueAt, 0) };
}

function forcedTask(v: unknown): ForcedTask | null {
  if (!isRecord(v) || v.type !== 'example' || !isStage(v.stage)) return null;
  const pick = v.pick;
  return typeof pick !== 'number' || !Number.isInteger(pick) || pick < 0 ? { type: 'example', stage: v.stage } : { type: 'example', stage: v.stage, pick };
}

/**
 * Version 1 asked more than its examples explained. Its learners get the new
 * examples once, before their next task: the word "Artikel" and "das" in
 * stage 1, the sentence example once sentences have started, and a thing
 * joining in a story. The stage 4 examples moved one place for the new one.
 */
function catchUp(p: Progress): ForcedTask[] {
  const moved = p.forced.map((f) => (f.stage === 4 && f.pick !== undefined && f.pick >= 2 ? { ...f, pick: f.pick + 1 } : f));
  const s = (stage: Stage) => p.stages[stage - 1];
  const extra: ForcedTask[] = [
    { type: 'example', stage: 1, pick: 0 },
    { type: 'example', stage: 1, pick: 2 },
    ...(s(3).unlocked && (s(3).ready || s(3).mastery >= INTRO_MASTERY) ? [{ type: 'example', stage: 3, pick: SENTENCE_EXAMPLE } as const] : []),
    ...(s(4).unlocked ? [{ type: 'example', stage: 4, pick: 2 } as const] : []),
  ];
  return [...moved, ...extra.filter((e) => !moved.some((f) => f.stage === e.stage && f.pick === e.pick))];
}

/**
 * Progress can come from another device via the server, so every field is
 * checked: only known fields with valid values are taken over. Unknown review
 * keys are dropped later by the engine.
 */
export function sanitizeProgress(raw: unknown, now: number): Progress {
  const fresh = freshProgress(now);
  if (!isRecord(raw) || (raw.version !== 1 && raw.version !== 2)) return fresh;
  const stored = Array.isArray(raw.stages) ? raw.stages : [];
  const round = isRecord(raw.round) ? raw.round : {};
  const p: Progress = {
    version: 2,
    session: num(raw.session, 1, 1),
    lastActive: num(raw.lastActive, now),
    lastAnswered: typeof raw.lastAnswered === 'number' ? num(raw.lastAnswered, 0) : null,
    taskCounter: num(raw.taskCounter, 0),
    points: num(raw.points, 0),
    correctTotal: num(raw.correctTotal, 0),
    stages: STAGES.map((s) => stageState(stored[s - 1], fresh.stages[s - 1])),
    reviewQueue: list(raw.reviewQueue, 12).map(reviewItem).filter((r): r is ReviewItem => r !== null),
    forced: list(raw.forced, 12).map(forcedTask).filter((f): f is ForcedTask => f !== null),
    recent: list(raw.recent, 8).filter((r): r is string => str(r)),
    wrongStreak: num(raw.wrongStreak, 0),
    correctStreak: num(raw.correctStreak, 0),
    round: { tasks: num(round.tasks, 0), points: num(round.points, 0), correct: num(round.correct, 0) },
    trophies: num(raw.trophies, 0),
  };
  if (raw.version === 1) p.forced = catchUp(p);
  return p;
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
