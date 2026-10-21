import { VALUES, gapValue, isValue, parseRow, rowCodes, type Row, type Value } from './content';

/**
 * "Notenwerte", from Leonie's own sheet (half, quarter, eighth note):
 *
 *   stage 1: note → length        a quarter note: [1 Schlag] [halber Schlag] [2 Schläge]
 *   stage 2: length → note        2 Schläge: [𝅗𝅥] [♩] [♪]
 *   stage 3: two beats            ♩ _ – the note that makes two beats
 *
 * The length is counted in beats and shown as fields, one per beat, each in
 * two halves for the eighths. Only what was explained is asked: the notes of
 * a stage come in steps, each with its examples first. No whole note, no
 * rests and no rhythm syllables yet.
 */
export type Stage = 1 | 2 | 3;
export const STAGES: readonly Stage[] = [1, 2, 3];

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
/** Correct answers in the window must cover every note (in stage 3: every missing note). */
export const MIN_DISTINCT: Record<Stage, number> = { 1: 3, 2: 3, 3: 3 };
/**
 * Guided examples, in steps: the notes of a step are asked only once its
 * examples have been shown. Stage 1 starts with the quarter and the eighth,
 * the half note follows; stage 3 starts with one note before the gap, the
 * empty two beats follow. Fixed lists, so the explanations can be recorded.
 */
export const EXAMPLES: Record<Stage, readonly (readonly string[])[]> = {
  1: [['q', 'e'], ['h']],
  2: [['h', 'e']],
  3: [['q_', 'qe_'], ['_']],
};
/** Learning points of a stage after which its next step comes, per step. */
export const STEP_MASTERY = 40;
/** Below this the gap of stage 3 is the last note; afterwards it can be anywhere. */
export const INTRO_MASTERY = 40;
/** Stage 3: how often each note is missing; the half note has a single row ("_"). */
export const GAP_SHARE: Record<Value, number> = { q: 0.4, e: 0.4, h: 0.2 };
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

export type Rng = () => number;
export type TaskKind = 'example' | 'practice' | 'review';

export interface Task {
  id: number;
  stage: Stage;
  kind: TaskKind;
  /** Stages 1 and 2: the value ("q"); 3: the row ("qe_"). */
  key: string;
  /** What the task is about: the note (1, 2) or the missing note (3). */
  value: Value;
  /** One note per answer, shown as a length in stage 1. */
  options: Value[];
  correctIndex: number;
  row: Row | null;
}

export interface Attempt {
  ok: boolean;
  value: Value;
}

export interface StageState {
  unlocked: boolean;
  /** Steps of EXAMPLES shown so far: their notes may be asked. */
  steps: number;
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
  /** Index into exampleKeys(); without one an example shown before and not seen recently. */
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
  version: 2;
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

/** The examples of a stage, all steps in a row. */
export function exampleKeys(stage: Stage): string[] {
  return EXAMPLES[stage].flat();
}

/** The note a key asks for: the note itself, or the one missing in the row. */
export function keyValue(stage: Stage, key: string): Value | null {
  if (stage === 3) {
    const row = parseRow(key);
    return row && gapValue(row);
  }
  return isValue(key) ? key : null;
}

/** True if the key makes a task of the stage. */
export function validKey(stage: Stage, key: string): boolean {
  return keyValue(stage, key) !== null;
}

/** Forced examples of one step. */
function stepExamples(stage: Stage, step: number): ForcedTask[] {
  const before = EXAMPLES[stage].slice(0, step).flat().length;
  return EXAMPLES[stage][step].map((_, i) => ({ type: 'example', stage, pick: before + i }));
}

export function freshStage(unlocked: boolean): StageState {
  return { unlocked, steps: unlocked ? 1 : 0, attempts: 0, window: [], mastery: 0, ready: false, readySession: null, secure: false };
}

export function freshProgress(now: number): Progress {
  return {
    version: 2,
    session: 1,
    lastActive: now,
    lastAnswered: null,
    taskCounter: 0,
    points: 0,
    correctTotal: 0,
    stages: STAGES.map((s) => freshStage(s === 1)),
    reviewQueue: [],
    forced: stepExamples(1, 0),
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

  /**
   * The notes a stage may ask: those of the steps shown, all once every step
   * was. Stage 2 explains only the half note and the eighth; the quarter is
   * known from stage 1.
   */
  askedValues(stage: Stage): Value[] {
    const steps = EXAMPLES[stage];
    const shown = this.stageState(stage).steps;
    if (shown >= steps.length) return [...VALUES];
    const values = steps.slice(0, shown).flat().map((key) => keyValue(stage, key));
    return VALUES.filter((v) => values.includes(v));
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
      this.nextStep(task.stage);
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

  /** The examples of the next step, once the stage has enough learning points for it. */
  private nextStep(stage: Stage): void {
    const s = this.stageState(stage);
    if (s.steps >= EXAMPLES[stage].length || s.mastery < STEP_MASTERY * s.steps) return;
    this.progress.forced.push(...stepExamples(stage, s.steps));
    s.steps += 1;
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
          this.stageState(next).steps = 1;
          unlocked.push(next);
          p.forced.push(...stepExamples(next, 0));
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
    const all = exampleKeys(stage);
    if (index !== undefined && all[index]) return all[index];
    const shown = EXAMPLES[stage].slice(0, Math.max(1, this.stageState(stage).steps)).flat();
    const fresh = shown.filter((key) => !this.progress.recent.includes(`${stage}:${key}`));
    return pick(fresh.length ? fresh : shown, this.rng);
  }

  private pickReview(): Task | null {
    const p = this.progress;
    // Keys from an older version or a broken sync are dropped.
    p.reviewQueue = p.reviewQueue.filter((r) => validKey(r.stage, r.key));
    // dueAt keeps it away for a few tasks; only the last task must not come again (with two notes open every key is recent).
    const last = p.recent[p.recent.length - 1];
    for (const item of p.reviewQueue) {
      if (item.dueAt > p.taskCounter || !this.stageState(item.stage).unlocked || last === `${item.stage}:${item.key}`) continue;
      if (!this.askedValues(item.stage).includes(keyValue(item.stage, item.key)!)) continue;
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

  /** Not among the last tasks; values not yet right in the window first, so every one comes up. */
  private fresh(stage: Stage, keys: readonly string[]): string {
    const recent = this.progress.recent;
    const right = new Set(this.stageState(stage).window.filter((a) => a.ok).map((a) => a.value));
    const notRecent = keys.filter((k) => !recent.includes(`${stage}:${k}`));
    const missing = notRecent.filter((k) => !right.has(keyValue(stage, k)!));
    // With only two notes open every key can be recent: then at least not the last task again.
    const notLast = keys.filter((k) => `${stage}:${k}` !== recent[recent.length - 1]);
    // Missing values only now and then: otherwise the next value is easy to guess.
    const pool = missing.length && this.rng() < 0.5 ? missing : notRecent.length ? notRecent : notLast.length ? notLast : keys;
    return pick(pool, this.rng);
  }

  private chooseKey(stage: Stage): string {
    if (stage !== 3) return this.fresh(stage, this.askedValues(stage));
    // While the stage is new the last note is missing; "_" (the empty two beats) counts as last.
    const intro = !this.stageState(3).ready && this.stageState(3).mastery < INTRO_MASTERY;
    const codes = rowCodes().filter((code) => !intro || code.endsWith('_'));
    const keysOf = (v: Value) => codes.filter((code) => keyValue(3, code) === v);
    // The half note has a single row: just seen, another note is missing.
    const asked = this.askedValues(3);
    const open = asked.filter((v) => keysOf(v).some((k) => !this.progress.recent.includes(`3:${k}`)));
    const shares = (open.length ? open : asked).map((v) => [v, GAP_SHARE[v]] as const);
    let r = this.rng() * shares.reduce((sum, [, share]) => sum + share, 0);
    const [value] = shares.find(([, share]) => (r -= share) < 0) ?? shares[shares.length - 1];
    return this.fresh(stage, keysOf(value));
  }

  /** Builds the task for a key; null if the key does not exist (any more). */
  makeTask(stage: Stage, kind: TaskKind, key: string): Task | null {
    const value = keyValue(stage, key);
    if (!value) return null;
    // Stage 1 offers only the lengths explained so far; later stages know all three.
    const others = shuffled((stage === 1 ? this.askedValues(1) : VALUES).filter((v) => v !== value), this.rng).slice(0, OPTIONS - 1);
    const options = shuffled([value, ...others], this.rng);
    return {
      id: this.progress.taskCounter, stage, kind, key, value, options,
      correctIndex: options.indexOf(value),
      row: stage === 3 ? parseRow(key) : null,
    };
  }
}
