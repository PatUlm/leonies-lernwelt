import { CONTEXT_HOURS, hour24, type DayContext } from './daytime';
import { buildDaytimeOptions, buildOptions, type AnswerOption } from './distractors';
import { formatSpoken } from './german';
import { explainExample, hintFor, inputHint, setHint, type Hint, type HintFocus } from './hints';
import {
  TIER_MINUTES, TIERS, formatDaytime, formatDigital, pick, tierOf, timeKey,
  type ClockTime, type Rng, type Tier,
} from './time';

/**
 * digital: read the clock, choose "3:45"; text: choose "Viertel vor vier";
 * daytime: with a context ("Es ist Abend") choose "21:45 Uhr";
 * set: set the hands for a given time; input: type the time shown;
 * halb: choose the regional "fünf vor halb vier".
 */
export type Track = 'digital' | 'text' | 'daytime' | 'set' | 'input' | 'halb';
export const TRACKS: readonly Track[] = ['digital', 'text', 'daytime', 'set', 'input', 'halb'];
/** Tracks mixed into the clock reading once unlocked, in the order they are introduced. */
export type SideTrack = Exclude<Track, 'digital'>;
export const SIDE_TRACKS: readonly SideTrack[] = ['text', 'set', 'input', 'daytime', 'halb'];
/** How a task is answered. */
export type TaskMode = 'choice' | 'set' | 'input';

export function modeOf(track: Track): TaskMode {
  return track === 'set' ? 'set' : track === 'input' ? 'input' : 'choice';
}

/**
 * Mastery points per tier decide progress, not days: an independent correct
 * answer adds MASTERY_CORRECT (plus a bonus when fluent), a mistake subtracts.
 * READY unlocks the next tier, SECURE earns the badge.
 */
export const MASTERY_CORRECT = 10;
export const MASTERY_FAST_BONUS = 5;
export const MASTERY_WRONG = 10;
export const READY_MASTERY = 60;
/**
 * Side tracks reuse clock readings the child already masters; only the wording,
 * the way of answering or the time of day is new, so their tiers are ready sooner.
 */
export const READY_MASTERY_BY_TRACK: Record<Track, number> = {
  digital: READY_MASTERY, text: 40, daytime: 40, set: 40, input: 40, halb: 40,
};
export const SECURE_MASTERY = 100;
export const MAX_MASTERY = 120;
/** Correct answers faster than this count as fluent. No timer is ever shown. */
export const FAST_ANSWER_MS: Record<Track, number> = {
  digital: 6000, text: 8000, daytime: 8000, set: 15000, input: 12000, halb: 8000,
};
/** Share of the newest tier, growing with its mastery from MIN to MAX. */
export const NEWEST_SHARE_MIN = 0.4;
export const NEWEST_SHARE_MAX = 0.75;
/** At most this many tasks of the newest tier in a row. */
export const MAX_NEWEST_RUN = 3;
/** Warm-up tasks from lower tiers when a new session starts; mistakes extend it. */
export const WARMUP_TASKS = 3;
export const MAX_WARMUP_TASKS = 6;
/**
 * Share of a side track among all tasks: higher while one of its tiers is still
 * being learned, lower once all unlocked tiers are mastered.
 */
export const SIDE_TRACK_SHARES: Record<SideTrack, { learning: number; practised: number }> = {
  text: { learning: 0.3, practised: 0.12 },
  set: { learning: 0.3, practised: 0.1 },
  input: { learning: 0.3, practised: 0.1 },
  daytime: { learning: 0.25, practised: 0.1 },
  halb: { learning: 0.2, practised: 0.06 },
};
/** Side tracks together take at most this; more once several are mastered. */
export const MAX_SIDE_SHARE = 0.4;
export const MAX_SIDE_SHARE_PRACTISED = 0.5;
/** Tiers that exist in a track (all others stay locked). */
export const TRACK_TIERS: Record<Track, readonly Tier[]> = {
  digital: TIERS, text: TIERS, set: TIERS, input: TIERS,
  daytime: [1, 2, 3],
  halb: [4, 5],
};
/** Share of tasks from tiers below the second newest (easy repetition). */
export const EASY_SHARE = 0.1;
/** Recent answers per tier, used to check that a tier was shown with variety. */
export const WINDOW = 8;
/** Correct answers in the window must cover this many different hours. */
export const MIN_DISTINCT_HOURS = 3;
export const EXAMPLES_PER_TIER = 2;
/** Tasks between two uses of the same time. */
export const RECENT_SPAN = 4;
/** Points for an independent correct answer, by tier. */
export const TIER_POINTS: Record<Tier, number> = { 1: 10, 2: 15, 3: 20, 4: 25, 5: 30, 6: 40 };
/** Extra points by track: more for setting the hands and typing the time. */
export const TRACK_BONUS: Record<Track, number> = { digital: 0, text: 5, daytime: 5, halb: 5, set: 10, input: 10 };
/** Points for a correct answer after using help (about half, no bonus). */
export const HELP_POINTS: Record<Tier, number> = { 1: 5, 2: 5, 3: 10, 4: 10, 5: 15, 6: 20 };
/** Share of tasks from secure tiers where the child first says the time aloud. */
export const SAY_FIRST_SHARE = 0.25;
export const CORRECT_PER_STAR = 5;
export const SESSION_GAP_MS = 30 * 60 * 1000;
/**
 * A round ends when its point target is reached: this many independent correct
 * answers of the current task mix. Mistakes cost nothing, they only mean more
 * practice before the trophy.
 */
export const ROUND_TARGET_FACTOR = 10;
export const MIN_ROUND_TARGET = 100;
/** Consecutive independent correct answers that earn a short praise. */
export const STREAK_PRAISE = 3;

/** Minute values a track practises in a tier ("halb" only the ones it renames). */
export function trackMinutes(track: Track, tier: Tier): readonly number[] {
  if (track === 'halb') return tier === 4 ? [20, 40] : [25, 35];
  return TIER_MINUTES[tier];
}

/** Minute steps the hands snap to when setting the clock, by tier. */
export function setStep(tier: Tier): number {
  return { 1: 60, 2: 30, 3: 15, 4: 5, 5: 5, 6: 1 }[tier];
}

export interface Attempt {
  ok: boolean;
  hour: number;
  minute: number;
}

export interface TierState {
  unlocked: boolean;
  /** Independent first tries (no help used). */
  attempts: number;
  /** Last independent first tries. */
  window: Attempt[];
  /** 0 … MAX_MASTERY, see READY_MASTERY and SECURE_MASTERY. */
  mastery: number;
  /** Reached READY_MASTERY once; stays true. */
  ready: boolean;
  /** Reached SECURE_MASTERY once; stays true (badge). */
  secure: boolean;
}

export interface ReviewItem {
  track: Track;
  hour: number;
  minute: number;
  context?: DayContext;
  dueAt: number;
}

export interface RoundState {
  /** Point target, fixed when the round starts. */
  target: number;
  points: number;
  /** Independent correct answers. */
  correct: number;
  /** All regular tasks answered in this round. */
  tasks: number;
}

export type RoundSummary = RoundState;

export type ForcedTask =
  | { type: 'example'; track: Track; tier: Tier }
  | { type: 'easy' };

export interface Progress {
  version: 1;
  session: number;
  lastActive: number;
  /** When the last task was answered; opening without answering does not count. */
  lastAnswered: number | null;
  taskCounter: number;
  points: number;
  correctTotal: number;
  tracks: Record<Track, TierState[]>;
  reviewQueue: ReviewItem[];
  forced: ForcedTask[];
  recent: string[];
  newestRun: number;
  /** Warm-up tasks from lower tiers still to come in this session. */
  warmup: number;
  wrongStreak: number;
  correctStreak: number;
  round: RoundState;
  trophies: number;
}

export type TaskKind = 'example' | 'practice' | 'review' | 'easy';

export interface Task {
  id: number;
  track: Track;
  tier: Tier;
  kind: TaskKind;
  mode: TaskMode;
  time: ClockTime;
  /** Daytime track: the time of day shown next to the clock. */
  context?: DayContext;
  /** Setting the hands: the time is given as "12:30" or in words. */
  prompt?: 'digital' | 'text';
  /** Choices (choice mode only). */
  options: AnswerOption[];
  correctIndex: number;
  /** Minute numbers around the dial shown from the start (introduction phase). */
  minuteLabels: boolean;
  /** Explanation shown with guided examples. */
  explanation?: string;
  /** Repetition of a tier she already reads securely ("Das kannst du schon!"). */
  familiar: boolean;
  /** Part of the warm-up at the start of a session. */
  warmup: boolean;
  /** Say the time aloud first, then reveal the choices (no mastery points). */
  sayFirst: boolean;
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
  /** Tiers that just became secure (learning badges). */
  secured: { track: Track; tier: Tier }[];
  offerPause: boolean;
  /** Set when a multiple of STREAK_PRAISE independent correct answers in a row is reached. */
  streak: number | null;
  /** Set when this answer completed the round. */
  roundComplete: RoundSummary | null;
}

/** A typed or set time: hour 0–23 when typed, 1–12 when set on the clock. */
export interface GivenTime {
  hour: number;
  minute: number;
}

const ALL_HOURS: readonly number[] = Array.from({ length: 12 }, (_, i) => i + 1);

function freshTier(unlocked: boolean): TierState {
  return { unlocked, attempts: 0, window: [], mastery: 0, ready: false, secure: false };
}

export function freshProgress(now: number): Progress {
  const tracks = Object.fromEntries(
    TRACKS.map((track) => [track, TIERS.map((t) => freshTier(track === 'digital' && t === 1))]),
  ) as Record<Track, TierState[]>;
  return {
    version: 1,
    session: 1,
    lastActive: now,
    lastAnswered: null,
    taskCounter: 0,
    points: 0,
    correctTotal: 0,
    tracks,
    reviewQueue: [],
    forced: [{ type: 'example', track: 'digital', tier: 1 }, { type: 'example', track: 'digital', tier: 1 }],
    recent: [],
    newestRun: 0,
    warmup: 0,
    wrongStreak: 0,
    correctStreak: 0,
    round: { target: MIN_ROUND_TARGET, points: 0, correct: 0, tasks: 0 },
    trophies: 0,
  };
}

/** Text of a choice: "3:45", "Viertel vor vier", "15:45 Uhr" or "fünf vor halb vier". */
export function label(track: Track, t: ClockTime, hour24Value?: number): string {
  if (track === 'text') return formatSpoken(t);
  if (track === 'halb') return formatSpoken(t, { half: true });
  if (track === 'daytime') return formatDaytime(t, hour24Value ?? t.hour);
  return formatDigital(t);
}

export interface EngineOptions {
  /** "Erst sagen, dann aufdecken" now and then for secure tiers. */
  sayFirst?: boolean;
}

export class Engine {
  private current: Task | null = null;
  /**
   * Queue entry behind the current task. It is only removed once the task is
   * answered, so leaving or reloading never loses an example or a review.
   */
  private currentSource: 'forced' | ReviewItem | null = null;
  readonly progress: Progress;
  private readonly rng: Rng;
  sayFirst: boolean;

  constructor(progress: Progress, rng: Rng = Math.random, options: EngineOptions = {}) {
    this.progress = progress;
    this.rng = rng;
    this.sayFirst = options.sayFirst ?? false;
    // Progress saved before rounds had a point target.
    if (typeof progress.round?.target !== 'number') this.progress.round = this.newRound();
  }

  get stars(): number {
    return Math.floor(this.progress.correctTotal / CORRECT_PER_STAR);
  }

  tierState(track: Track, tier: Tier): TierState {
    return this.progress.tracks[track][tier - 1];
  }

  unlockedTiers(track: Track): Tier[] {
    return TIERS.filter((t) => this.tierState(track, t).unlocked);
  }

  /** Contexts of the daytime track reached so far: afternoon first, noon and night last. */
  dayContexts(): DayContext[] {
    const contexts: DayContext[] = ['afternoon'];
    if (this.tierState('daytime', 2).ready) contexts.push('forenoon', 'evening');
    if (this.tierState('daytime', 3).ready) contexts.push('noon', 'night');
    return contexts;
  }

  /** Call on app start and before each task; opens a new session after a long pause. */
  touch(now: number): boolean {
    const p = this.progress;
    const newSession = now - p.lastActive > SESSION_GAP_MS;
    if (newSession) {
      p.session += 1;
      p.wrongStreak = 0;
      p.newestRun = 0;
      // A short warm-up with earlier tiers; correct answers end it quickly.
      p.warmup = this.unlockedTiers('digital').length > 1 ? WARMUP_TASKS : 0;
      // Mistakes from earlier sessions come back early, spread over the first tasks.
      p.reviewQueue.forEach((item, i) => (item.dueAt = p.taskCounter + 2 + i * 3));
    }
    p.lastActive = now;
    return newSession;
  }

  nextTask(): Task {
    const p = this.progress;
    p.taskCounter += 1;
    this.currentSource = null;
    const task = this.pickForced() ?? this.pickReview() ?? this.pickPractice();
    // Examples count too, so a shown solution never comes straight back as a task.
    p.recent = [...p.recent, timeKey(task.time)].slice(-RECENT_SPAN);
    this.current = task;
    return task;
  }

  /** Choice mode. `elapsedMs`: active answer time, for the fluency bonus. */
  answer(task: Task, optionIndex: number, helped: boolean, elapsedMs = Infinity): AnswerResult {
    const chosen = task.options[optionIndex];
    const ok = chosen.kind === 'correct';
    return this.settle(task, ok, ok ? null : hintFor(task, chosen), helped, elapsedMs);
  }

  /**
   * Set and input mode. Typed times without a time-of-day context are right in
   * either half of the day (11:23 and 23:23 show the same clock).
   */
  answerTime(task: Task, given: GivenTime, helped: boolean, elapsedMs = Infinity): AnswerResult {
    const hour12 = given.hour % 12 || 12;
    const ok = hour12 === task.time.hour && given.minute === task.time.minute;
    let hint: Hint | null = null;
    if (!ok) hint = task.mode === 'set' ? setHint(task.time, { hour: hour12, minute: given.minute }) : inputHint(task.time, given.hour);
    return this.settle(task, ok, hint, helped, elapsedMs);
  }

  private settle(task: Task, ok: boolean, hint: Hint | null, helped: boolean, elapsedMs: number): AnswerResult {
    if (this.current?.id !== task.id) throw new Error('answer for a task that is not current');
    this.current = null;
    const p = this.progress;
    p.lastAnswered = p.lastActive;
    if (this.currentSource === 'forced') p.forced.shift();
    else if (this.currentSource) p.reviewQueue = p.reviewQueue.filter((r) => r !== this.currentSource);
    this.currentSource = null;
    const result: AnswerResult = {
      ok, scored: false, correctIndex: task.correctIndex, points: 0,
      starEarned: false, unlocked: [], secured: [], offerPause: false,
      streak: null, roundComplete: null,
    };

    if (task.kind === 'example') {
      if (hint) {
        result.hint = hint.text;
        result.hintFocus = hint.focus;
      }
      return result;
    }

    if (hint) {
      result.hint = hint.text;
      result.hintFocus = hint.focus;
      this.scheduleReview(task);
    }

    // The warm-up shrinks with every correct answer, also one found with help.
    if (task.warmup) p.warmup = ok ? Math.max(0, p.warmup - 1) : Math.min(MAX_WARMUP_TASKS, p.warmup + 1);

    if (helped) {
      p.wrongStreak = 0;
      p.correctStreak = 0;
      if (ok) this.award(result, HELP_POINTS[task.tier]);
      this.countRound(result, false);
      return result;
    }

    const state = this.tierState(task.track, task.tier);
    // After saying it aloud first, the choice gives round points but no mastery.
    if (!task.sayFirst) {
      result.scored = true;
      const wasSecure = state.secure;
      this.recordAttempt(task, state, ok, ok && elapsedMs < FAST_ANSWER_MS[task.track]);
      if (state.secure && !wasSecure) result.secured.push({ track: task.track, tier: task.tier });
    }
    if (ok) {
      this.award(result, TIER_POINTS[task.tier] + TRACK_BONUS[task.track]);
      p.correctTotal += 1;
      result.starEarned = p.correctTotal % CORRECT_PER_STAR === 0;
      p.wrongStreak = 0;
      p.correctStreak += 1;
      if (p.correctStreak % STREAK_PRAISE === 0) result.streak = p.correctStreak;
    } else {
      p.correctStreak = 0;
      p.wrongStreak += 1;
      if (p.wrongStreak === 2) {
        p.forced.push({ type: 'example', track: task.track, tier: task.tier }, { type: 'easy' });
      } else if (p.wrongStreak >= 3) {
        p.forced.push({ type: 'easy' });
        result.offerPause = true;
        p.wrongStreak = 0;
      }
    }

    result.unlocked = this.updateUnlocks();
    this.countRound(result, ok);
    return result;
  }

  private award(result: AnswerResult, points: number): void {
    result.points = points;
    this.progress.points += points;
  }

  private countRound(result: AnswerResult, independentCorrect: boolean): void {
    const round = this.progress.round;
    round.tasks += 1;
    round.points += result.points;
    if (independentCorrect) round.correct += 1;
    if (round.points < round.target) return;
    result.roundComplete = { ...round };
    this.progress.trophies += 1;
    this.progress.round = this.newRound();
  }

  private newRound(): RoundState {
    return { target: this.roundTarget(), points: 0, correct: 0, tasks: 0 };
  }

  /** Target for a new round: ROUND_TARGET_FACTOR × expected points per task, rounded to 10. */
  roundTarget(): number {
    const sides = this.activeSideShares();
    const sideTotal = sides.reduce((sum, [, share]) => sum + share, 0);
    const expected =
      (1 - sideTotal) * this.expectedPoints('digital') +
      sides.reduce((sum, [track, share]) => sum + share * (this.expectedPoints(track) + TRACK_BONUS[track]), 0);
    return Math.max(MIN_ROUND_TARGET, Math.round((ROUND_TARGET_FACTOR * expected) / 10) * 10);
  }

  /** The newest clock tier was just unlocked and has hardly been practised yet. */
  private introducingClockTier(): boolean {
    const digital = this.unlockedTiers('digital');
    const newest = this.tierState('digital', digital[digital.length - 1]);
    return digital.length > 1 && newest.mastery < 2 * MASTERY_CORRECT && !newest.ready;
  }

  /** A side-track tier was just unlocked and has hardly been practised yet. */
  private introducingSideTier(): boolean {
    return SIDE_TRACKS.some((track) =>
      this.unlockedTiers(track).some((t) => {
        const s = this.tierState(track, t);
        return !s.ready && s.mastery < 2 * MASTERY_CORRECT;
      }),
    );
  }

  /** Unlocked side tracks with their current share of all tasks. */
  private activeSideShares(): [SideTrack, number][] {
    // Only one novelty at a time: side tracks step back while a new clock tier starts,
    // and only one side track at a time gets the higher learning share, in SIDE_TRACKS order.
    let learningTaken = this.introducingClockTier();
    let practisedTracks = 0;
    const shares = SIDE_TRACKS.filter((t) => this.unlockedTiers(t).length).map((t): [SideTrack, number] => {
      const learning = this.unlockedTiers(t).some((tier) => !this.tierState(t, tier).ready);
      if (!learning) practisedTracks += 1;
      const boosted = learning && !learningTaken;
      if (boosted) learningTaken = true;
      return [t, boosted ? SIDE_TRACK_SHARES[t].learning : SIDE_TRACK_SHARES[t].practised];
    });
    const cap = practisedTracks >= 2 && !this.introducingClockTier() ? MAX_SIDE_SHARE_PRACTISED : MAX_SIDE_SHARE;
    const total = shares.reduce((sum, [, share]) => sum + share, 0);
    const scale = total > cap ? cap / total : 1;
    return shares.map(([t, share]) => [t, share * scale]);
  }

  private expectedPoints(track: Track): number {
    return this.tierShares(track).reduce((sum, [tier, share]) => sum + share * TIER_POINTS[tier], 0);
  }

  /** Probability of each unlocked tier for a practice task; the newest tier comes first. */
  private tierShares(track: Track): [Tier, number][] {
    const unlocked = this.unlockedTiers(track);
    const newest = unlocked[unlocked.length - 1];
    if (unlocked.length === 1) return [[newest, 1]];
    const growth = Math.min(1, this.tierState(track, newest).mastery / READY_MASTERY_BY_TRACK[track]);
    const newestShare = NEWEST_SHARE_MIN + (NEWEST_SHARE_MAX - NEWEST_SHARE_MIN) * growth;
    const previous = unlocked[unlocked.length - 2];
    const easy = unlocked.slice(0, -2);
    const easyShare = easy.length ? EASY_SHARE : 0;
    return [
      [newest, newestShare],
      [previous, 1 - newestShare - easyShare],
      ...easy.map((t): [Tier, number] => [t, easyShare / easy.length]),
    ];
  }

  // --- selection -----------------------------------------------------------

  private pickForced(): Task | null {
    const forced = this.progress.forced[0];
    if (!forced) return null;
    this.currentSource = 'forced';
    if (forced.type === 'example') return this.makeTask(forced.track, forced.tier, 'example');
    const easyTiers = this.unlockedTiers('digital').filter((t) => t <= 2);
    return this.makeTask('digital', pick(easyTiers, this.rng), 'easy');
  }

  private pickReview(): Task | null {
    const p = this.progress;
    const idx = p.reviewQueue.findIndex((r) => r.dueAt <= p.taskCounter && !p.recent.includes(timeKey(r)));
    if (idx < 0) return null;
    const item = p.reviewQueue[idx];
    this.currentSource = item;
    const time = { hour: item.hour, minute: item.minute };
    const tier = TRACK_TIERS[item.track].includes(tierOf(item.minute)) ? tierOf(item.minute) : TRACK_TIERS[item.track][0];
    return this.makeTask(item.track, tier, 'review', { time, context: item.context });
  }

  private pickPractice(): Task {
    const warmupTier = this.chooseWarmupTier();
    if (warmupTier) return this.makeTask('digital', warmupTier, 'practice', undefined, true);
    const track = this.chooseTrack();
    return this.makeTask(track, this.chooseTier(track), 'practice');
  }

  /** During the warm-up: an earlier clock tier, the weaker ones more often. */
  private chooseWarmupTier(): Tier | null {
    const lower = this.unlockedTiers('digital').slice(0, -1);
    if (this.progress.warmup <= 0 || lower.length === 0) return null;
    const weights = lower.map((t) => MAX_MASTERY + 20 - this.tierState('digital', t).mastery);
    let r = this.rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lower.length; i++) {
      if (r < weights[i]) return lower[i];
      r -= weights[i];
    }
    return lower[lower.length - 1];
  }

  private chooseTrack(): Track {
    let r = this.rng();
    for (const [track, share] of this.activeSideShares()) {
      if (r < share) return track;
      r -= share;
    }
    return 'digital';
  }

  private chooseTier(track: Track): Tier {
    const p = this.progress;
    const shares = this.tierShares(track);
    const newest = shares[0][0];
    // A short break from the newest tier now and then; its share goes to the second newest.
    if (p.newestRun >= MAX_NEWEST_RUN && shares.length > 1) {
      shares[1][1] += shares[0][1];
      shares[0][1] = 0;
    }
    let r = this.rng();
    let tier = shares[shares.length - 1][0];
    for (const [t, share] of shares) {
      if (r < share) {
        tier = t;
        break;
      }
      r -= share;
    }
    p.newestRun = tier === newest ? p.newestRun + 1 : 0;
    return tier;
  }

  /** Spreads minutes and hours so the mastery window sees variety. */
  private chooseTime(track: Track, tier: Tier, context?: DayContext): ClockTime {
    const state = this.tierState(track, tier);
    const minutes = trackMinutes(track, tier);
    let minuteChoices = [...minutes];
    if (minutes.length > 1 && minutes.length < 12) {
      const counts = minutes.map((m) => state.window.filter((a) => a.minute === m).length);
      const least = Math.min(...counts);
      minuteChoices = minutes.filter((_, i) => counts[i] === least);
    }
    const recentHours = state.window.slice(-3).map((a) => a.hour);
    const recent = this.progress.recent;
    const hours = context ? CONTEXT_HOURS[context] : ALL_HOURS;

    let fallback: ClockTime | null = null;
    for (let i = 0; i < 60; i++) {
      const t = { hour: pick(hours, this.rng), minute: pick(minuteChoices, this.rng) };
      if (recent.includes(timeKey(t))) continue;
      fallback ??= t;
      if (hours.length < 4 || !recentHours.includes(t.hour)) return t;
    }
    return fallback ?? { hour: pick(hours, this.rng), minute: pick(minutes, this.rng) };
  }

  private makeTask(
    track: Track,
    tier: Tier,
    kind: TaskKind,
    given?: { time: ClockTime; context?: DayContext },
    warmup = false,
  ): Task {
    const state = this.tierState(track, tier);
    const mode = modeOf(track);
    const context = track === 'daytime' ? (given?.context ?? pick(this.dayContexts(), this.rng)) : undefined;
    const time = given?.time ?? this.chooseTime(track, tier, context);
    const advanced = state.mastery >= READY_MASTERY / 2 || state.ready;
    let options: AnswerOption[] = [];
    if (mode === 'choice') {
      options = context
        ? buildDaytimeOptions(time, hour24(context, time.hour), advanced, this.rng)
        : buildOptions(time, { tier, advanced }, this.rng);
    }
    // Setting the hands: the time in words once that text tier is mastered.
    const prompt = mode === 'set' ? (this.tierState('text', tier).ready && this.rng() < 0.5 ? 'text' : 'digital') : undefined;
    // Minute numbers help with the first answers of the 10- and 5-minute tiers.
    const introPhase = kind !== 'review' && state.mastery < 2 * MASTERY_CORRECT && !state.ready;
    const sayFirst =
      this.sayFirst && mode === 'choice' && kind === 'practice' && !warmup && state.secure && this.rng() < SAY_FIRST_SHARE;
    return {
      id: this.progress.taskCounter,
      track, tier, kind, mode, time, context, prompt, options,
      correctIndex: options.findIndex((o) => o.kind === 'correct'),
      minuteLabels: kind === 'example' || (track === 'digital' && tier >= 4 && introPhase),
      explanation: kind === 'example' ? explainExample({ track, time, context }) : undefined,
      familiar: kind !== 'example' && state.secure,
      warmup,
      sayFirst,
    };
  }

  // --- learning state ------------------------------------------------------

  private recordAttempt(task: Task, state: TierState, ok: boolean, fluent: boolean): void {
    state.attempts += 1;
    if (!task.minuteLabels) {
      state.window = [...state.window, { ok, hour: task.time.hour, minute: task.time.minute }].slice(-WINDOW);
    }
    const delta = ok ? MASTERY_CORRECT + (fluent ? MASTERY_FAST_BONUS : 0) : -MASTERY_WRONG;
    state.mastery = Math.max(0, Math.min(MAX_MASTERY, state.mastery + delta));
    if (state.mastery >= SECURE_MASTERY && state.ready) state.secure = true;
  }

  private updateUnlocks(): { track: Track; tier: Tier }[] {
    const p = this.progress;
    const unlocked: { track: Track; tier: Tier }[] = [];
    const unlock = (track: Track, tier: Tier) => {
      const s = this.tierState(track, tier);
      s.unlocked = true;
      unlocked.push({ track, tier });
      for (let i = 0; i < EXAMPLES_PER_TIER; i++) p.forced.push({ type: 'example', track, tier });
    };

    for (const track of TRACKS) {
      for (const tier of TIERS) {
        const s = this.tierState(track, tier);
        if (s.unlocked && !s.ready && isReady(tier, s, READY_MASTERY_BY_TRACK[track], trackMinutes(track, tier))) {
          s.ready = true;
          if (s.mastery >= SECURE_MASTERY) s.secure = true;
          if (track === 'digital' && tier < 6) unlock('digital', (tier + 1) as Tier);
        }
      }
    }
    // One novelty at a time: no new side-track tier while a clock tier or
    // another side-track tier is being introduced; at most one per answer.
    if (this.introducingClockTier() || this.introducingSideTier()) return unlocked;
    const next = this.nextSideTier();
    if (next) unlock(next.track, next.tier);
    return unlocked;
  }

  /** The next side-track tier that may start, in SIDE_TRACKS order. */
  private nextSideTier(): { track: SideTrack; tier: Tier } | null {
    const ready = (track: Track, tier: Tier) => this.tierState(track, tier).ready;
    const prevReady = (track: Track, tier: Tier) => {
      const tiers = TRACK_TIERS[track];
      const i = tiers.indexOf(tier);
      return i <= 0 || ready(track, tiers[i - 1]);
    };
    const eligible: Record<SideTrack, (tier: Tier) => boolean> = {
      text: (tier) => ready('digital', tier),
      set: (tier) => ready('digital', tier),
      // Typing comes after setting the hands was learned once.
      input: (tier) => ready('digital', tier) && ready('set', 1),
      daytime: (tier) => ready('digital', tier === 3 ? 3 : 2),
      // "zehn vor halb" needs "halb" to be secure; "fünf vor halb" the 5-minute words.
      halb: (tier) => ready('text', tier) && (tier === 5 || this.tierState('text', 2).secure),
    };
    for (const track of SIDE_TRACKS) {
      for (const tier of TRACK_TIERS[track]) {
        if (this.tierState(track, tier).unlocked) continue;
        if (prevReady(track, tier) && eligible[track](tier)) return { track, tier };
        break; // tiers of a track come in order
      }
    }
    return null;
  }

  private scheduleReview(task: Task): void {
    const p = this.progress;
    const key = timeKey(task.time);
    if (p.reviewQueue.some((r) => r.track === task.track && timeKey(r) === key)) return;
    p.reviewQueue.push({
      track: task.track, hour: task.time.hour, minute: task.time.minute, context: task.context,
      dueAt: p.taskCounter + RECENT_SPAN + 1 + Math.floor(this.rng() * 2),
    });
    if (p.reviewQueue.length > 12) p.reviewQueue.shift();
  }
}

/**
 * Enough mastery points, earned on varied times: the recent correct answers
 * cover several hours and every minute value the tier practises.
 */
export function isReady(
  tier: Tier,
  s: TierState,
  readyAt = READY_MASTERY,
  minutes: readonly number[] = TIER_MINUTES[tier],
): boolean {
  if (s.mastery < readyAt) return false;
  const correct = s.window.filter((a) => a.ok);
  const hours = new Set(correct.map((a) => a.hour));
  // Noon and night tasks only have the 12, so variety counts across contexts.
  if (hours.size < Math.min(MIN_DISTINCT_HOURS, correct.length)) return false;
  if (minutes.length > 1 && minutes.length < 12) {
    const seen = new Set(correct.map((a) => a.minute));
    if (!minutes.every((m) => seen.has(m))) return false;
  }
  return true;
}
