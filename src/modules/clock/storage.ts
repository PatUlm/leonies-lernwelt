import { readJson, remove, writeJson } from '../../shared/storage';
import type { DayContext } from './daytime';
import {
  DAY_CHECK_SIZE, MASTERY_CORRECT, MAX_MASTERY, READY_MASTERY, SECURE_MASTERY, TRACKS, WINDOW, freshProgress,
  type Attempt, type DayAttempt, type DayMix, type ForcedTask, type Progress, type ReviewItem, type TierState, type Track,
} from './engine';
import { TIERS, type Tier } from './time';

const KEY = 'uhr.progress.v1';
const CONTEXTS: readonly DayContext[] = ['afternoon', 'forenoon', 'evening', 'noon', 'night'];

type Raw = Record<string, unknown>;

function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function int(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function list(v: unknown, max: number): unknown[] {
  return Array.isArray(v) ? v.slice(-max) : [];
}

function isTrack(v: unknown): v is Track {
  return typeof v === 'string' && (TRACKS as readonly string[]).includes(v);
}

function attempt(v: unknown): Attempt | null {
  if (!isRecord(v)) return null;
  const hour = int(v.hour, 1, 12);
  const minute = int(v.minute, 0, 59);
  return hour === null || minute === null ? null : { ok: bool(v.ok), hour, minute };
}

function tierState(v: unknown, fresh: TierState): TierState {
  if (!isRecord(v)) return fresh;
  const window = list(v.window, WINDOW).map(attempt).filter((a): a is Attempt => a !== null);
  const ready = bool(v.ready);
  const secure = bool(v.secure);
  // Mastery points replaced the day-based progress: derive them from the old state.
  const mastery =
    typeof v.mastery === 'number'
      ? num(v.mastery, 0, 0, MAX_MASTERY)
      : secure
        ? SECURE_MASTERY
        : ready
          ? READY_MASTERY
          : Math.min(window.filter((a) => a.ok).length * MASTERY_CORRECT, READY_MASTERY - MASTERY_CORRECT);
  return { unlocked: bool(v.unlocked, fresh.unlocked), attempts: num(v.attempts, 0), window, mastery, ready, secure };
}

function reviewItem(v: unknown): ReviewItem | null {
  if (!isRecord(v) || !isTrack(v.track)) return null;
  const hour = int(v.hour, 1, 12);
  const minute = int(v.minute, 0, 59);
  if (hour === null || minute === null) return null;
  const context = CONTEXTS.includes(v.context as DayContext) ? (v.context as DayContext) : undefined;
  return { track: v.track, hour, minute, context, dueAt: num(v.dueAt, 0) };
}

function dayAttempt(v: unknown): DayAttempt | null {
  if (!isRecord(v)) return null;
  const hour24 = int(v.hour24, 0, 23);
  const session = int(v.session, 1, Number.MAX_SAFE_INTEGER);
  return hour24 === null || session === null ? null : { ok: bool(v.ok), hour24, session };
}

function dayMix(v: unknown, fresh: DayMix): DayMix {
  if (!isRecord(v) || !(['off', 'transfer', 'full'] as unknown[]).includes(v.phase)) return fresh;
  return {
    phase: v.phase as DayMix['phase'],
    since: num(v.since, 0),
    recent: list(v.recent, DAY_CHECK_SIZE).map(dayAttempt).filter((a): a is DayAttempt => a !== null),
  };
}

function forcedTask(v: unknown): ForcedTask | null {
  if (!isRecord(v)) return null;
  if (v.type === 'easy') return { type: 'easy' };
  const tier = int(v.tier, 1, 6);
  if (v.type !== 'example' || !isTrack(v.track) || tier === null) return null;
  const pick = int(v.pick, 0, 99);
  return pick === null ? { type: 'example', track: v.track, tier: tier as Tier } : { type: 'example', track: v.track, tier: tier as Tier, pick };
}

/**
 * Progress can come from another device via the server, so every field is
 * checked: only known fields with valid values are taken over (no strings
 * where the UI expects numbers). Fields added later get their defaults.
 */
export function sanitizeProgress(raw: unknown, now: number): Progress {
  const fresh = freshProgress(now);
  if (!isRecord(raw) || raw.version !== 1) return fresh;
  const tracks = Object.fromEntries(
    TRACKS.map((track) => {
      const stored = isRecord(raw.tracks) ? raw.tracks[track] : undefined;
      const tiers = TIERS.map((tier) =>
        tierState(Array.isArray(stored) ? stored[tier - 1] : undefined, fresh.tracks[track][tier - 1]),
      );
      return [track, tiers];
    }),
  ) as Progress['tracks'];
  const round = isRecord(raw.round) ? raw.round : {};
  const taskCounter = num(raw.taskCounter, 0);
  const lastActive = num(raw.lastActive, now);
  const lastAnswered =
    typeof raw.lastAnswered === 'number'
      ? num(raw.lastAnswered, 0)
      : raw.lastAnswered === undefined && taskCounter > 0
        ? lastActive
        : null;
  return {
    version: 1,
    session: num(raw.session, 1, 1),
    lastActive,
    lastAnswered,
    taskCounter,
    points: num(raw.points, 0),
    correctTotal: num(raw.correctTotal, 0),
    tracks,
    reviewQueue: list(raw.reviewQueue, 12).map(reviewItem).filter((r): r is ReviewItem => r !== null),
    forced: list(raw.forced, 12).map(forcedTask).filter((f): f is ForcedTask => f !== null),
    recent: list(raw.recent, 8).filter((r): r is string => typeof r === 'string' && /^\d{1,2}:\d{1,2}$/.test(r)),
    newestRun: num(raw.newestRun, 0),
    warmup: num(raw.warmup, 0, 0, 10),
    wrongStreak: num(raw.wrongStreak, 0),
    correctStreak: num(raw.correctStreak, 0),
    round: {
      target: num(round.target, fresh.round.target, 10),
      points: num(round.points, 0),
      correct: num(round.correct, 0),
      tasks: num(round.tasks, 0),
    },
    trophies: num(raw.trophies, 0),
    dayMix: dayMix(raw.dayMix, fresh.dayMix),
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
