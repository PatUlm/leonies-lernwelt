import { readJson, remove, writeJson } from '../../shared/storage';
import { nounOf } from './content';
import {
  EXAMPLES, MAX_MASTERY, RECENT_SPAN, STAGES, WINDOW, freshProgress, parseKey,
  type Attempt, type ForcedTask, type Progress, type ReviewItem, type Stage, type StageState,
} from './engine';

const KEY = 'howmany.progress.v1';

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
  if (!isRecord(v) || typeof v.noun !== 'string' || !nounOf(v.noun) || typeof v.count !== 'number') return null;
  if (!parseKey(`${v.noun}:${v.count}`)) return null;
  return { ok: bool(v.ok), count: v.count, noun: v.noun };
}

/** Progress from before the steps of examples starts at the first: the later ones follow as its learning points allow. */
function stageState(v: unknown, fresh: StageState, stage: Stage): StageState {
  if (!isRecord(v)) return fresh;
  const unlocked = bool(v.unlocked, fresh.unlocked);
  return {
    unlocked,
    steps: unlocked ? num(v.steps, 1, 1, EXAMPLES[stage].length) : 0,
    attempts: num(v.attempts, 0),
    window: list(v.window, WINDOW).map(attempt).filter((a): a is Attempt => a !== null),
    mastery: num(v.mastery, 0, 0, MAX_MASTERY),
    ready: bool(v.ready),
    readySession: typeof v.readySession === 'number' ? num(v.readySession, 1, 1) : null,
    secure: bool(v.secure),
  };
}

function reviewItem(v: unknown): ReviewItem | null {
  if (!isRecord(v) || !isStage(v.stage) || typeof v.key !== 'string' || !parseKey(v.key)) return null;
  return { stage: v.stage, key: v.key, dueAt: num(v.dueAt, 0) };
}

function forcedTask(v: unknown): ForcedTask | null {
  if (!isRecord(v) || v.type !== 'example' || !isStage(v.stage)) return null;
  const pick = v.pick;
  return typeof pick === 'number' && Number.isInteger(pick) && pick >= 0 ? { type: 'example', stage: v.stage, pick } : null;
}

/**
 * Progress can come from another device via the server, so every field is
 * checked: only known fields with valid values are taken over. Version 1 had
 * other stages (the whole sentence from the start): she starts again at stage
 * 1, her stars, trophies and points stay.
 */
export function sanitizeProgress(raw: unknown, now: number): Progress {
  const fresh = freshProgress(now);
  if (!isRecord(raw) || (raw.version !== 1 && raw.version !== 2)) return fresh;
  const kept = {
    session: num(raw.session, 1, 1),
    lastActive: num(raw.lastActive, now),
    lastAnswered: typeof raw.lastAnswered === 'number' ? num(raw.lastAnswered, 0) : null,
    taskCounter: num(raw.taskCounter, 0),
    points: num(raw.points, 0),
    correctTotal: num(raw.correctTotal, 0),
    trophies: num(raw.trophies, 0),
  };
  if (raw.version === 1) return { ...fresh, ...kept, news: true };
  const stored = Array.isArray(raw.stages) ? raw.stages : [];
  const round = isRecord(raw.round) ? raw.round : {};
  return {
    ...kept,
    version: 2,
    stages: STAGES.map((s) => stageState(stored[s - 1], fresh.stages[s - 1], s)),
    reviewQueue: list(raw.reviewQueue, 12).map(reviewItem).filter((r): r is ReviewItem => r !== null),
    forced: list(raw.forced, 12).map(forcedTask).filter((f): f is ForcedTask => f !== null),
    recent: list(raw.recent, RECENT_SPAN).filter((r): r is string => typeof r === 'string' && parseKey(r) !== null),
    wrongStreak: num(raw.wrongStreak, 0),
    correctStreak: num(raw.correctStreak, 0),
    round: { tasks: num(round.tasks, 0), points: num(round.points, 0), correct: num(round.correct, 0) },
    news: bool(raw.news),
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
