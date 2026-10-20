import {
  BAR_EIGHTHS, EIGHTHS, TARGETS, VALUES, WRONG_GROUP_BEATS, barCode, blockRows, gapValue, groupsOf, isTarget, isValue, lengthOf, parseBar,
  parseNotes, type Bar, type Target, type Value,
} from './content';

/**
 * "Notenwerte", from Leonie's own sheet (whole, half, quarter, eighth note):
 *
 *   stage 1: note → length        a quarter note: [1 Schlag] [2 Schläge] [halber Schlag]
 *   stage 2: the same length      a half note: [♩♩] [♩] [♩♩♩] – as long as two quarters
 *   stage 3: length → note        2 Schläge: [𝅗𝅥] [♩] [𝅝]
 *   stage 4: a 4/4 bar            𝅗𝅥 ♩ _ – the note that fills the bar
 *
 * The length is counted in beats and shown as fields, one per beat, each in
 * two halves for the eighths. No rests, and no rhythm syllables: neither is
 * taught to her yet.
 */
export type Stage = 1 | 2 | 3 | 4;
export const STAGES: readonly Stage[] = [1, 2, 3, 4];

/**
 * Learning points per stage: +MASTERY_CORRECT per independent correct answer,
 * nothing taken away for a mistake and no bonus for speed. READY unlocks the
 * next stage, SECURE earns the badge.
 */
export const MASTERY_CORRECT = 10;
export const READY_MASTERY = 100;
export const SECURE_MASTERY = 140;
export const MAX_MASTERY = 160;
export const WINDOW = 10;
export const READY_WINDOW_CORRECT = 8;
export const SECURE_WINDOW_CORRECT = 9;
/** Correct answers in the window must cover this many values: every note, every target, both gaps. */
export const MIN_DISTINCT: Record<Stage, number> = { 1: 4, 2: 3, 3: 4, 4: 2 };
/**
 * Below this the fields stand under the groups (stage 2) and the notes of the
 * bar (stage 4), and the bar misses its last note; afterwards the fields come
 * with help and the answer, and the gap can be anywhere.
 */
export const INTRO_MASTERY = 40;
/** "Was dauert genauso lang?": mostly the half note, as on her sheet. */
export const TARGET_SHARE: Record<Target, number> = { h: 0.5, w: 0.3, q: 0.2 };
/** Notes of a bar besides the gap: at most two pairs of eighths and a quarter, so it fits a phone. */
export const BAR_MAX_NOTES = 5;
/** Share of the newest stage once several are open; the one before gets most of the rest. */
export const NEWEST_SHARE = 0.6;
export const EASY_SHARE = 0.1;
/** A round is a fixed number of tasks, so a hard round never drags on. */
export const ROUND_TASKS = 10;
export const CORRECT_PER_STAR = 5;
export const POINTS = 10;
/** Points for a correct answer after using help (half). */
export const HELP_POINTS = 5;
export const SESSION_GAP_MS = 30 * 60 * 1000;
/** Tasks between two uses of the same key. */
export const RECENT_SPAN = 3;
export const STREAK_PRAISE = 3;
export const OPTIONS = 3;

/**
 * Guided examples come from fixed lists, so their explanations can be
 * recorded beforehand. Stage 1 shows the beat with the quarter and its half
 * with the eighth; the half and the whole note are just more fields.
 */
export const EXAMPLES: Record<Stage, readonly string[]> = {
  1: ['q', 'e'],
  2: ['h:qq', 'h:eeq'],
  3: ['h', 'e'],
  4: ['hq_', 'qq_'],
};

export type Rng = () => number;
export type TaskKind = 'example' | 'practice' | 'review';

export interface Task {
  id: number;
  stage: Stage;
  kind: TaskKind;
  /** Stages 1 and 3: the value ("q"); 2: target and group ("h:eeq"); 4: the bar ("hq_"). */
  key: string;
  /** What the task is about: the note (1, 3), the note to match (2) or the missing note (4). */
  value: Value;
  /** The notes of each answer: one note in stages 1, 3 and 4 (shown as a length in stage 1), a group in stage 2. */
  options: Value[][];
  correctIndex: number;
  bar: Bar | null;
  /** The fields stand under the notes of the groups and the bar. */
  fields: boolean;
}

export interface Attempt {
  ok: boolean;
  value: Value;
}

export interface StageState {
  unlocked: boolean;
  /** Independent answers (no help used). */
  attempts: number;
  window: Attempt[];
  /** 0 … MAX_MASTERY, see READY_MASTERY and SECURE_MASTERY. */
  mastery: number;
  /** Reached once; stays true. */
  ready: boolean;
  /** Session in which the stage became ready: "secure" needs a later one. */
  readySession: number | null;
  /** Badge earned; stays true. */
  secure: boolean;
}

export interface ReviewItem {
  stage: Stage;
  key: string;
  dueAt: number;
}

export interface ForcedTask {
  type: 'example';
  stage: Stage;
  /** Index into EXAMPLES; without one an example not seen recently. */
  pick?: number;
}

export interface RoundState {
  /** Regular tasks answered in this round. */
  tasks: number;
  points: number;
  /** Independent correct answers. */
  correct: number;
}

export interface Progress {
  version: 1;
  session: number;
  lastActive: number;
  /** When the last task was answered; opening without answering does not count. */
  lastAnswered: number | null;
  taskCounter: number;
  points: number;
  correctTotal: number;
  stages: StageState[];
  reviewQueue: ReviewItem[];
  forced: ForcedTask[];
  /** "<stage>:<key>" of the last tasks, so none comes straight back. */
  recent: string[];
  wrongStreak: number;
  correctStreak: number;
  round: RoundState;
  trophies: number;
}

export interface AnswerResult {
  ok: boolean;
  points: number;
  starEarned: boolean;
  /** Newly unlocked stages, for a short positive announcement. */
  unlocked: Stage[];
  /** Stages that just became secure (learning badges). */
  secured: Stage[];
  offerPause: boolean;
  /** Set when a multiple of STREAK_PRAISE independent correct answers in a row is reached. */
  streak: number | null;
  /** Set when this answer completed the round. */
  roundComplete: RoundState | null;
}

/** Key of a stage 2 task: "h:eeq". */
export function groupKey(target: Target, group: readonly Value[]): string {
  return `${target}:${group.join('')}`;
}

/** Stage 2: the note to match and the group as long as it; null for a broken key. */
export function parseGroupKey(key: string): { target: Target; group: Value[] } | null {
  const [target, code, ...rest] = key.split(':');
  const group = code ? parseNotes(code) : null;
  if (rest.length || !isTarget(target) || !group || group.length < 2 || lengthOf(group) !== EIGHTHS[target]) return null;
  return { target, group };
}

/** True if the key makes a task of the stage. */
export function validKey(stage: Stage, key: string): boolean {
  if (stage === 2) return parseGroupKey(key) !== null;
  if (stage === 4) return parseBar(key) !== null;
  return isValue(key);
}

function introExamples(stage: Stage): ForcedTask[] {
  return EXAMPLES[stage].map((_, pick) => ({ type: 'example', stage, pick }));
}

function freshStage(unlocked: boolean): StageState {
  return { unlocked, attempts: 0, window: [], mastery: 0, ready: false, readySession: null, secure: false };
}

export function freshProgress(now: number): Progress {
  return {
    version: 1,
    session: 1,
    lastActive: now,
    lastAnswered: null,
    taskCounter: 0,
    points: 0,
    correctTotal: 0,
    stages: STAGES.map((s) => freshStage(s === 1)),
    reviewQueue: [],
    forced: introExamples(1),
    recent: [],
    wrongStreak: 0,
    correctStreak: 0,
    round: { tasks: 0, points: 0, correct: 0 },
    trophies: 0,
  };
}

function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function shuffled<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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

  constructor(progress: Progress, rng: Rng = Math.random) {
    this.progress = progress;
    this.rng = rng;
  }

  get stars(): number {
    return Math.floor(this.progress.correctTotal / CORRECT_PER_STAR);
  }

  stageState(stage: Stage): StageState {
    return this.progress.stages[stage - 1];
  }

  unlockedStages(): Stage[] {
    return STAGES.filter((s) => this.stageState(s).unlocked);
  }

  /** Call on app start and before each task; opens a new session after a long pause. */
  touch(now: number): boolean {
    const p = this.progress;
    const newSession = now - p.lastActive > SESSION_GAP_MS;
    if (newSession) {
      p.session += 1;
      p.wrongStreak = 0;
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
    p.recent = [...p.recent, `${task.stage}:${task.key}`].slice(-RECENT_SPAN);
    this.current = task;
    return task;
  }

  answer(task: Task, optionIndex: number, helped: boolean): AnswerResult {
    if (this.current?.id !== task.id) throw new Error('answer for a task that is not current');
    this.current = null;
    const p = this.progress;
    p.lastAnswered = p.lastActive;
    if (this.currentSource === 'forced') p.forced.shift();
    else if (this.currentSource) p.reviewQueue = p.reviewQueue.filter((r) => r !== this.currentSource);
    this.currentSource = null;

    const ok = optionIndex === task.correctIndex;
    const result: AnswerResult = {
      ok, points: 0, starEarned: false, unlocked: [], secured: [], offerPause: false, streak: null, roundComplete: null,
    };
    if (task.kind === 'example') return result;
    if (!ok) this.scheduleReview(task);

    if (helped) {
      p.wrongStreak = 0;
      p.correctStreak = 0;
      if (ok) this.award(result, HELP_POINTS);
      this.countRound(result, false);
      return result;
    }

    const state = this.stageState(task.stage);
    const wasSecure = STAGES.filter((s) => this.stageState(s).secure);
    state.attempts += 1;
    state.window = [...state.window, { ok, value: task.value }].slice(-WINDOW);

    if (ok) {
      state.mastery = Math.min(MAX_MASTERY, state.mastery + MASTERY_CORRECT);
      this.award(result, POINTS);
      p.correctTotal += 1;
      result.starEarned = p.correctTotal % CORRECT_PER_STAR === 0;
      p.wrongStreak = 0;
      p.correctStreak += 1;
      if (p.correctStreak % STREAK_PRAISE === 0) result.streak = p.correctStreak;
    } else {
      p.correctStreak = 0;
      p.wrongStreak += 1;
      if (p.wrongStreak === 2) {
        p.forced.push({ type: 'example', stage: task.stage });
      } else if (p.wrongStreak >= 3) {
        result.offerPause = true;
        p.wrongStreak = 0;
      }
    }

    result.unlocked = this.updateStages(ok ? task.stage : null);
    result.secured = STAGES.filter((s) => this.stageState(s).secure && !wasSecure.includes(s));
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
    if (round.tasks < ROUND_TASKS) return;
    result.roundComplete = { ...round };
    this.progress.trophies += 1;
    this.progress.round = { tasks: 0, points: 0, correct: 0 };
  }

  /**
   * Marks stages ready or secure and unlocks the next one; returns the unlocked
   * stages. `solved`: the stage just answered correctly, the only one that may
   * become secure.
   */
  private updateStages(solved: Stage | null): Stage[] {
    const p = this.progress;
    const unlocked: Stage[] = [];
    for (const stage of STAGES) {
      const s = this.stageState(stage);
      if (!s.unlocked) continue;
      const correct = s.window.filter((a) => a.ok);
      const varied = new Set(correct.map((a) => a.value)).size >= MIN_DISTINCT[stage];
      if (!s.ready && s.mastery >= READY_MASTERY && correct.length >= READY_WINDOW_CORRECT && varied) {
        s.ready = true;
        s.readySession = p.session;
        const next = (stage + 1) as Stage;
        if (stage < STAGES.length && !this.stageState(next).unlocked) {
          this.stageState(next).unlocked = true;
          unlocked.push(next);
          p.forced.push(...introExamples(next));
        }
      }
      // Secure only when solved again on another day, not in one long sitting.
      if (stage === solved && s.ready && !s.secure && s.mastery >= SECURE_MASTERY &&
        correct.length >= SECURE_WINDOW_CORRECT && p.session > (s.readySession ?? p.session)) {
        s.secure = true;
      }
    }
    return unlocked;
  }

  private scheduleReview(task: Task): void {
    const p = this.progress;
    if (p.reviewQueue.some((r) => r.stage === task.stage && r.key === task.key)) return;
    p.reviewQueue.push({ stage: task.stage, key: task.key, dueAt: p.taskCounter + RECENT_SPAN + Math.floor(this.rng() * 2) });
    if (p.reviewQueue.length > 12) p.reviewQueue.shift();
  }

  // --- selection -----------------------------------------------------------

  private pickForced(): Task | null {
    const forced = this.progress.forced[0];
    if (!forced) return null;
    this.currentSource = 'forced';
    return this.makeTask(forced.stage, 'example', this.exampleKey(forced))!;
  }

  private exampleKey({ stage, pick: index }: ForcedTask): string {
    const pool = EXAMPLES[stage];
    if (index !== undefined && pool[index]) return pool[index];
    const fresh = pool.filter((key) => !this.progress.recent.includes(`${stage}:${key}`));
    return pick(fresh.length ? fresh : pool, this.rng);
  }

  private pickReview(): Task | null {
    const p = this.progress;
    // Keys from an older version or a broken sync are dropped.
    p.reviewQueue = p.reviewQueue.filter((r) => validKey(r.stage, r.key));
    for (const item of p.reviewQueue) {
      if (item.dueAt > p.taskCounter || !this.stageState(item.stage).unlocked || p.recent.includes(`${item.stage}:${item.key}`)) continue;
      this.currentSource = item;
      return this.makeTask(item.stage, 'review', item.key)!;
    }
    return null;
  }

  private pickPractice(): Task {
    const stage = this.chooseStage();
    return this.makeTask(stage, 'practice', this.chooseKey(stage))!;
  }

  /** The newest stage first, the one before as practice, older ones now and then. */
  private chooseStage(): Stage {
    const open = this.unlockedStages();
    if (open.length === 1) return open[0];
    const newest = open[open.length - 1];
    const previous = open[open.length - 2];
    const older = open.slice(0, -2);
    const r = this.rng();
    if (r < NEWEST_SHARE) return newest;
    if (!older.length || r < 1 - EASY_SHARE) return previous;
    return pick(older, this.rng);
  }

  /** Below INTRO_MASTERY while the stage is new. */
  private intro(stage: Stage): boolean {
    const s = this.stageState(stage);
    return !s.ready && s.mastery < INTRO_MASTERY;
  }

  /** Not among the last tasks; values not yet right in the window first, so every one comes up. */
  private fresh(stage: Stage, keys: readonly string[], valueOf: (key: string) => Value): string {
    const recent = this.progress.recent;
    const right = new Set(this.stageState(stage).window.filter((a) => a.ok).map((a) => a.value));
    const notRecent = keys.filter((k) => !recent.includes(`${stage}:${k}`));
    const missing = notRecent.filter((k) => !right.has(valueOf(k)));
    // Missing values only now and then: otherwise the next value is easy to guess.
    const pool = missing.length && this.rng() < 0.5 ? missing : notRecent.length ? notRecent : keys;
    return pick(pool, this.rng);
  }

  private chooseKey(stage: Stage): string {
    switch (stage) {
      case 1:
      case 3:
        return this.fresh(stage, VALUES, (k) => k as Value);
      case 2: {
        // The quarter has a single group (two eighths): just seen, another note comes.
        const keysOf = (t: Target) => groupsOf(EIGHTHS[t] / 2).map((g) => groupKey(t, g));
        const open = TARGETS.filter((t) => keysOf(t).some((k) => !this.progress.recent.includes(`2:${k}`)));
        const shares = (open.length ? open : TARGETS).map((t) => [t, TARGET_SHARE[t]] as const);
        let r = this.rng() * shares.reduce((sum, [, share]) => sum + share, 0);
        const [target] = shares.find(([, share]) => (r -= share) < 0) ?? shares[shares.length - 1];
        return this.fresh(stage, keysOf(target), () => target);
      }
      case 4: {
        let key = '';
        for (let i = 0; i < 5 && (!key || this.progress.recent.includes(`4:${key}`)); i++) key = this.freshBar();
        return key;
      }
    }
  }

  /** A quarter or a half missing; while the stage is new the last note, then any. */
  private freshBar(): string {
    const gap: Value = this.rng() < 0.5 ? 'q' : 'h';
    const row = pick(blockRows((BAR_EIGHTHS - EIGHTHS[gap]) / 2, BAR_MAX_NOTES), this.rng);
    const at = this.intro(4) ? row.length : Math.floor(this.rng() * (row.length + 1));
    const before = row.slice(0, at).flat();
    return barCode({ notes: [...before, gap, ...row.slice(at).flat()], gap: before.length });
  }

  /** The right value and two others, shuffled. */
  private singleOptions(value: Value): { options: Value[][]; correctIndex: number } {
    const others = shuffled(VALUES.filter((v) => v !== value), this.rng).slice(0, OPTIONS - 1);
    const options = shuffled([value, ...others], this.rng);
    return { options: options.map((v) => [v]), correctIndex: options.indexOf(value) };
  }

  /** Builds the task for a key; null if the key does not exist (any more). */
  makeTask(stage: Stage, kind: TaskKind, key: string): Task | null {
    const base = { id: this.progress.taskCounter, stage, kind, key, bar: null, fields: false };
    if (stage === 1 || stage === 3) {
      if (!isValue(key)) return null;
      return { ...base, value: key, ...this.singleOptions(key) };
    }
    if (stage === 2) {
      const parsed = parseGroupKey(key);
      if (!parsed) return null;
      const wrong = WRONG_GROUP_BEATS[parsed.target].map((beats) => pick(groupsOf(beats), this.rng));
      const options = shuffled([parsed.group, ...wrong], this.rng);
      return {
        ...base,
        value: parsed.target,
        options,
        correctIndex: options.indexOf(parsed.group),
        fields: kind === 'example' || this.intro(2),
      };
    }
    const bar = parseBar(key);
    if (!bar) return null;
    return { ...base, value: gapValue(bar), ...this.singleOptions(gapValue(bar)), bar, fields: kind === 'example' || this.intro(4) };
  }
}

/** All notes of a stage 4 task once the gap is filled with `value`. */
export function filledBar(bar: Bar, value: Value): Value[] {
  return bar.notes.map((v, i) => (i === bar.gap ? value : v));
}
