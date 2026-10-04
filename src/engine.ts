import { buildOptions, type AnswerOption } from './distractors';
import { formatSpoken } from './german';
import { explainExample, hintFor, type HintFocus } from './hints';
import {
  TIER_MINUTES, TIERS, formatDigital, pick, tierOf, timeKey, wrapHour,
  type ClockTime, type Rng, type Tier,
} from './time';

export type Track = 'digital' | 'text';

/** Share of tasks from the newest tier, raised or lowered per block of 4. */
export const NEWEST_SHARES = [0.15, 0.3, 0.45, 0.6] as const;
/** Share of text tasks among all tasks once text is unlocked. */
export const TEXT_SHARES = [0.1, 0.2, 0.3] as const;
/** Share of tasks from tiers below the second newest (easy repetition). */
export const EASY_SHARE = 0.12;
export const WINDOW = 8;
export const WINDOW_REQUIRED = 7;
export const MIN_ATTEMPTS_FOR_READY = 12;
export const MIN_DISTINCT_HOURS = 4;
export const BLOCK = 4;
export const EXAMPLES_PER_TIER = 2;
/** Tasks between two uses of the same time. */
export const RECENT_SPAN = 4;
export const POINTS_PER_CORRECT = 10;
export const CORRECT_PER_STAR = 5;
export const SESSION_GAP_MS = 30 * 60 * 1000;

export interface Attempt {
  ok: boolean;
  hour: number;
  minute: number;
}

export interface TierState {
  unlocked: boolean;
  /** Independent first tries (no help used). */
  attempts: number;
  /** Last independent first tries without automatic clock helpers. */
  window: Attempt[];
  /** Current block for steering the newest-tier share. */
  block: boolean[];
  step: number;
  ready: boolean;
  readySession: number | null;
  secure: boolean;
  /** Independent tries in sessions after the tier became ready. */
  review: boolean[];
}

export interface ReviewItem {
  track: Track;
  hour: number;
  minute: number;
  dueAt: number;
}

export type ForcedTask =
  | { type: 'example'; track: Track; tier: Tier }
  | { type: 'easy' };

export interface Progress {
  version: 1;
  session: number;
  lastActive: number;
  taskCounter: number;
  points: number;
  correctTotal: number;
  tracks: Record<Track, TierState[]>;
  textBlock: boolean[];
  textStep: number;
  reviewQueue: ReviewItem[];
  forced: ForcedTask[];
  recent: string[];
  newestRun: number;
  wrongStreak: number;
}

export type TaskKind = 'example' | 'practice' | 'review' | 'easy';

export interface Task {
  id: number;
  track: Track;
  tier: Tier;
  kind: TaskKind;
  time: ClockTime;
  options: AnswerOption[];
  correctIndex: number;
  /** Minute numbers around the dial shown from the start (introduction phase). */
  minuteLabels: boolean;
  /** Explanation shown with guided examples. */
  explanation?: string;
}

export interface AnswerResult {
  ok: boolean;
  /** Counted as independent success or failure. */
  scored: boolean;
  correctIndex: number;
  points: number;
  starEarned: boolean;
  hint?: string;
  hintFocus?: HintFocus;
  /** Newly unlocked tiers, for a short positive announcement. */
  unlocked: { track: Track; tier: Tier }[];
  offerPause: boolean;
}

function freshTier(unlocked: boolean): TierState {
  return {
    unlocked, attempts: 0, window: [], block: [], step: 0,
    ready: false, readySession: null, secure: false, review: [],
  };
}

export function freshProgress(now: number): Progress {
  return {
    version: 1,
    session: 1,
    lastActive: now,
    taskCounter: 0,
    points: 0,
    correctTotal: 0,
    tracks: {
      digital: TIERS.map((t) => freshTier(t === 1)),
      text: TIERS.map(() => freshTier(false)),
    },
    textBlock: [],
    textStep: 0,
    reviewQueue: [],
    forced: [{ type: 'example', track: 'digital', tier: 1 }, { type: 'example', track: 'digital', tier: 1 }],
    recent: [],
    newestRun: 0,
    wrongStreak: 0,
  };
}

export function label(track: Track, t: ClockTime): string {
  return track === 'text' ? formatSpoken(t) : formatDigital(t);
}

export class Engine {
  private current: Task | null = null;

  constructor(
    readonly progress: Progress,
    private readonly rng: Rng = Math.random,
  ) {}

  get stars(): number {
    return Math.floor(this.progress.correctTotal / CORRECT_PER_STAR);
  }

  tierState(track: Track, tier: Tier): TierState {
    return this.progress.tracks[track][tier - 1];
  }

  unlockedTiers(track: Track): Tier[] {
    return TIERS.filter((t) => this.tierState(track, t).unlocked);
  }

  /** Call on app start and before each task; opens a new session after a long pause. */
  touch(now: number): boolean {
    const p = this.progress;
    const newSession = now - p.lastActive > SESSION_GAP_MS;
    if (newSession) {
      p.session += 1;
      p.wrongStreak = 0;
      p.newestRun = 0;
      // Mistakes from earlier sessions come back early, spread over the first tasks.
      p.reviewQueue.forEach((item, i) => (item.dueAt = p.taskCounter + 2 + i * 3));
    }
    p.lastActive = now;
    return newSession;
  }

  nextTask(): Task {
    const p = this.progress;
    p.taskCounter += 1;
    const task = this.pickForced() ?? this.pickReview() ?? this.pickPractice();
    if (task.kind !== 'example') {
      p.recent = [...p.recent, timeKey(task.time)].slice(-RECENT_SPAN);
    }
    this.current = task;
    return task;
  }

  answer(task: Task, optionIndex: number, helped: boolean): AnswerResult {
    if (this.current?.id !== task.id) throw new Error('answer for a task that is not current');
    this.current = null;
    const p = this.progress;
    const chosen = task.options[optionIndex];
    const ok = chosen.kind === 'correct';
    const result: AnswerResult = {
      ok, scored: false, correctIndex: task.correctIndex, points: 0,
      starEarned: false, unlocked: [], offerPause: false,
    };

    if (task.kind === 'example') return result;

    if (!ok) {
      const hint = hintFor(task.track, task.time, chosen);
      result.hint = hint.text;
      result.hintFocus = hint.focus;
      this.scheduleReview(task);
    }

    if (helped) {
      p.wrongStreak = 0;
      return result;
    }

    result.scored = true;
    const state = this.tierState(task.track, task.tier);
    this.recordAttempt(task, state, ok);
    if (ok) {
      p.points += POINTS_PER_CORRECT;
      p.correctTotal += 1;
      result.points = POINTS_PER_CORRECT;
      result.starEarned = p.correctTotal % CORRECT_PER_STAR === 0;
      p.wrongStreak = 0;
    } else {
      p.wrongStreak += 1;
      if (p.wrongStreak === 2) {
        p.forced.push({ type: 'example', track: task.track, tier: task.tier }, { type: 'easy' });
      } else if (p.wrongStreak >= 3) {
        p.forced.push({ type: 'easy' });
        result.offerPause = true;
        p.wrongStreak = 0;
      }
    }

    if (task.track === 'text') this.steerTextShare(ok);
    result.unlocked = this.updateUnlocks();
    return result;
  }

  // --- selection -----------------------------------------------------------

  private pickForced(): Task | null {
    const forced = this.progress.forced.shift();
    if (!forced) return null;
    if (forced.type === 'example') {
      return this.makeTask(forced.track, forced.tier, 'example', this.chooseTime(forced.track, forced.tier));
    }
    const easyTiers = this.unlockedTiers('digital').filter((t) => t <= 2);
    const tier = pick(easyTiers, this.rng);
    return this.makeTask('digital', tier, 'easy', this.chooseTime('digital', tier));
  }

  private pickReview(): Task | null {
    const p = this.progress;
    const idx = p.reviewQueue.findIndex(
      (r) => r.dueAt <= p.taskCounter && !p.recent.includes(timeKey(r)),
    );
    if (idx < 0) return null;
    const [item] = p.reviewQueue.splice(idx, 1);
    const time = { hour: item.hour, minute: item.minute };
    return this.makeTask(item.track, tierOf(item.minute), 'review', time);
  }

  private pickPractice(): Task {
    const track = this.chooseTrack();
    const tier = this.chooseTier(track);
    return this.makeTask(track, tier, 'practice', this.chooseTime(track, tier));
  }

  private chooseTrack(): Track {
    if (this.unlockedTiers('text').length === 0) return 'digital';
    return this.rng() < TEXT_SHARES[this.progress.textStep] ? 'text' : 'digital';
  }

  private chooseTier(track: Track): Tier {
    const p = this.progress;
    const unlocked = this.unlockedTiers(track);
    const newest = unlocked[unlocked.length - 1];
    if (unlocked.length === 1) return newest;

    const state = this.tierState(track, newest);
    // At most two tasks from the newest tier in a row.
    const newestShare = p.newestRun >= 2 ? 0 : NEWEST_SHARES[state.step];
    const easy = unlocked.filter((t) => t < newest - 1);
    const easyShare = easy.length ? EASY_SHARE : 0;

    const r = this.rng();
    let tier: Tier;
    if (r < newestShare) tier = newest;
    else if (r < newestShare + easyShare) tier = pick(easy, this.rng);
    else tier = (newest - 1) as Tier;

    p.newestRun = tier === newest ? p.newestRun + 1 : 0;
    return tier;
  }

  /** Spreads minutes and hours so the mastery window sees variety. */
  private chooseTime(track: Track, tier: Tier): ClockTime {
    const state = this.tierState(track, tier);
    const minutes = TIER_MINUTES[tier];
    let minuteChoices = [...minutes];
    if (tier >= 3 && tier <= 5) {
      const counts = minutes.map((m) => state.window.filter((a) => a.minute === m).length);
      const least = Math.min(...counts);
      minuteChoices = minutes.filter((_, i) => counts[i] === least);
    }
    const recentHours = state.window.slice(-3).map((a) => a.hour);
    const recent = this.progress.recent;

    let fallback: ClockTime | null = null;
    for (let i = 0; i < 60; i++) {
      const t = { hour: 1 + Math.floor(this.rng() * 12), minute: pick(minuteChoices, this.rng) };
      if (recent.includes(timeKey(t))) continue;
      fallback ??= t;
      if (!recentHours.includes(t.hour)) return t;
    }
    return fallback ?? { hour: wrapHour(1 + Math.floor(this.rng() * 12)), minute: pick(minutes, this.rng) };
  }

  private makeTask(track: Track, tier: Tier, kind: TaskKind, time: ClockTime): Task {
    const state = this.tierState(track, tier);
    const advanced = state.step >= 2 || state.ready;
    const options = buildOptions(time, { tier, advanced }, this.rng);
    const correctIndex = options.findIndex((o) => o.kind === 'correct');
    const introPhase = kind !== 'review' && state.step === 0 && !state.ready;
    return {
      id: this.progress.taskCounter,
      track, tier, kind, time, options, correctIndex,
      minuteLabels: kind === 'example' || (track === 'digital' && tier >= 4 && introPhase),
      explanation: kind === 'example' ? explainExample(track, time) : undefined,
    };
  }

  // --- learning state ------------------------------------------------------

  private recordAttempt(task: Task, state: TierState, ok: boolean): void {
    const p = this.progress;
    state.attempts += 1;
    if (!task.minuteLabels) {
      state.window = [...state.window, { ok, hour: task.time.hour, minute: task.time.minute }].slice(-WINDOW);
    }
    state.block.push(ok);
    if (state.block.length >= BLOCK) {
      const good = state.block.filter(Boolean).length;
      if (good >= 3) state.step = Math.min(state.step + 1, NEWEST_SHARES.length - 1);
      else if (good <= 1) state.step = Math.max(state.step - 1, 0);
      state.block = [];
    }
    // Gentle fallback: share drops back when the tier clearly overwhelms.
    if (state.attempts >= 6 && state.window.length >= 6) {
      const rate = state.window.filter((a) => a.ok).length / state.window.length;
      if (rate < 0.5) state.step = 0;
    }
    if (state.ready && state.readySession !== null && p.session > state.readySession) {
      state.review = [...state.review, ok].slice(-4);
      if (state.review.length === 4 && state.review.filter(Boolean).length >= 3) state.secure = true;
    }
  }

  private steerTextShare(ok: boolean): void {
    const p = this.progress;
    p.textBlock.push(ok);
    if (p.textBlock.length < BLOCK) return;
    const good = p.textBlock.filter(Boolean).length;
    // Only one novelty at a time: no more text while a new clock tier is being introduced.
    const digital = this.unlockedTiers('digital');
    const newestDigital = this.tierState('digital', digital[digital.length - 1]);
    const introducing = digital.length > 1 && newestDigital.step === 0 && !newestDigital.ready;
    if (good >= 3 && !introducing) p.textStep = Math.min(p.textStep + 1, TEXT_SHARES.length - 1);
    else if (good <= 1) p.textStep = Math.max(p.textStep - 1, 0);
    p.textBlock = [];
  }

  private updateUnlocks(): { track: Track; tier: Tier }[] {
    const p = this.progress;
    const unlocked: { track: Track; tier: Tier }[] = [];
    const unlock = (track: Track, tier: Tier) => {
      const s = this.tierState(track, tier);
      if (s.unlocked) return;
      s.unlocked = true;
      unlocked.push({ track, tier });
      for (let i = 0; i < EXAMPLES_PER_TIER; i++) p.forced.push({ type: 'example', track, tier });
    };

    for (const track of ['digital', 'text'] as const) {
      for (const tier of TIERS) {
        const s = this.tierState(track, tier);
        if (s.unlocked && !s.ready && isReady(tier, s)) {
          s.ready = true;
          s.readySession = p.session;
          if (track === 'digital' && tier < 6) unlock('digital', (tier + 1) as Tier);
        }
      }
    }
    // Text for a tier once the clock reading of that tier is secure and the
    // previous text tier is ready.
    for (const tier of TIERS) {
      const digital = this.tierState('digital', tier);
      const prevText = tier > 1 ? this.tierState('text', (tier - 1) as Tier) : null;
      if (digital.secure && (!prevText || prevText.ready)) unlock('text', tier);
    }
    return unlocked;
  }

  private scheduleReview(task: Task): void {
    const p = this.progress;
    const key = timeKey(task.time);
    if (p.reviewQueue.some((r) => r.track === task.track && timeKey(r) === key)) return;
    p.reviewQueue.push({
      track: task.track, hour: task.time.hour, minute: task.time.minute,
      dueAt: p.taskCounter + RECENT_SPAN + 1 + Math.floor(this.rng() * 2),
    });
    if (p.reviewQueue.length > 12) p.reviewQueue.shift();
  }
}

export function isReady(tier: Tier, s: TierState): boolean {
  if (s.attempts < MIN_ATTEMPTS_FOR_READY || s.window.length < WINDOW) return false;
  if (s.window.filter((a) => a.ok).length < WINDOW_REQUIRED) return false;
  if (new Set(s.window.map((a) => a.hour)).size < MIN_DISTINCT_HOURS) return false;
  if (tier >= 3 && tier <= 5) {
    const seen = new Set(s.window.map((a) => a.minute));
    if (!TIER_MINUTES[tier].every((m) => seen.has(m))) return false;
  }
  return true;
}
