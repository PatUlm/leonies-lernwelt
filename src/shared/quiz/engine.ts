/**
 * A quiz of fixed questions with three answers, the engine of the HSU modules
 * ("Der Baum", "Laubbäume"): the same learning rules as "Notenwerte". A course
 * defines the stages; each stage brings its keys (questions) in steps, every
 * key with its guided example first. Only what was explained is asked: a key
 * once its step was shown, an answer card once a key of its step was.
 */

/** A stage of a course. */
export interface QuizStage {
  /** Parents' area and toast: "Teile benennen". */
  name: string;
  /** Learning badge, phrased for the child. */
  badge: string;
  /** Keys of the stage in steps; the keys of a step are its guided examples, in this order. */
  steps: readonly (readonly string[])[];
  /** Correct answers in the window must cover this many different keys. */
  minDistinct: number;
}

/** What the engine needs to know about a course. */
export interface QuizRules {
  stages: readonly QuizStage[];
  /** The right answer of a key, e.g. the tree part "stamm". */
  answer(stage: number, key: string): string;
  /** Answers that never stand next to this key, e.g. the other task of the same tree part. */
  excluded?(stage: number, key: string, answer: string): boolean;
  /** Answers easily mixed up with the right one: one of them is always offered once explained. */
  partners?(stage: number, key: string): readonly string[];
  /** Answers that keep their place instead of being shuffled, e.g. "richtig" left of "falsch". */
  order?(stage: number): readonly string[] | undefined;
}

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
/** Learning points of a stage after which its next step comes, per step. */
export const STEP_MASTERY = 40;
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
export const MAX_REVIEWS = 12;

export type Rng = () => number;
export type TaskKind = 'example' | 'practice' | 'review';

export interface Task {
  id: number;
  /** 1-based, as shown to parents. */
  stage: number;
  kind: TaskKind;
  key: string;
  /** Answers on the buttons, the right one among them. */
  options: string[];
  correctIndex: number;
}

export interface Attempt {
  ok: boolean;
  key: string;
}

export interface StageState {
  unlocked: boolean;
  /** Steps shown so far: their keys may be asked. */
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
  stage: number;
  key: string;
  dueAt: number;
}

export interface ForcedTask {
  type: 'example';
  stage: number;
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
  unlocked: number[];
  /** Stages that just became secure (learning badges). */
  secured: number[];
  offerPause: boolean;
  /** Set when a multiple of STREAK_PRAISE independent correct answers in a row is reached. */
  streak: number | null;
  /** Set when this answer completed the round. */
  roundComplete: RoundState | null;
}

/** Stage numbers of a course: 1 … n. */
export function stageNumbers(rules: QuizRules): number[] {
  return rules.stages.map((_, i) => i + 1);
}

function stageDef(rules: QuizRules, stage: number): QuizStage {
  return rules.stages[stage - 1];
}

/** The examples of a stage, all steps in a row: every key of the stage once. */
export function exampleKeys(rules: QuizRules, stage: number): string[] {
  return stageDef(rules, stage).steps.flat();
}

/** True if the key makes a task of the stage. */
export function validKey(rules: QuizRules, stage: number, key: string): boolean {
  return Number.isInteger(stage) && stage >= 1 && stage <= rules.stages.length && exampleKeys(rules, stage).includes(key);
}

/** Forced examples of one step. */
function stepExamples(rules: QuizRules, stage: number, step: number): ForcedTask[] {
  const steps = stageDef(rules, stage).steps;
  const before = steps.slice(0, step).flat().length;
  return steps[step].map((_, i) => ({ type: 'example', stage, pick: before + i }));
}

export function freshStage(unlocked: boolean): StageState {
  return { unlocked, steps: unlocked ? 1 : 0, attempts: 0, window: [], mastery: 0, ready: false, readySession: null, secure: false };
}

export function freshProgress(rules: QuizRules, now: number): Progress {
  return {
    version: 1,
    session: 1,
    lastActive: now,
    lastAnswered: null,
    taskCounter: 0,
    points: 0,
    correctTotal: 0,
    stages: rules.stages.map((_, i) => freshStage(i === 0)),
    reviewQueue: [],
    forced: stepExamples(rules, 1, 0),
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
  readonly rules: QuizRules;
  private readonly rng: Rng;
  private readonly stages: number[];

  constructor(rules: QuizRules, progress: Progress, rng: Rng = Math.random) {
    this.rules = rules;
    this.progress = progress;
    this.rng = rng;
    this.stages = stageNumbers(rules);
  }

  get stars(): number {
    return Math.floor(this.progress.correctTotal / CORRECT_PER_STAR);
  }

  stageState(stage: number): StageState {
    return this.progress.stages[stage - 1];
  }

  unlockedStages(): number[] {
    return this.stages.filter((s) => this.stageState(s).unlocked);
  }

  /** The keys a stage may ask: those of the steps shown. */
  askedKeys(stage: number): string[] {
    return stageDef(this.rules, stage).steps.slice(0, Math.max(1, this.stageState(stage).steps)).flat();
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
    const wasSecure = this.stages.filter((s) => this.stageState(s).secure);
    state.attempts += 1;
    state.window = [...state.window, { ok, key: task.key }].slice(-WINDOW);

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
    result.secured = this.stages.filter((s) => this.stageState(s).secure && !wasSecure.includes(s));
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
  private nextStep(stage: number): void {
    const s = this.stageState(stage);
    if (s.steps >= stageDef(this.rules, stage).steps.length || s.mastery < STEP_MASTERY * s.steps) return;
    this.progress.forced.push(...stepExamples(this.rules, stage, s.steps));
    s.steps += 1;
  }

  /**
   * Marks stages ready or secure and unlocks the next one; returns the unlocked
   * stages. A stage is ready only once all its steps were shown. `solved`: the
   * stage just answered correctly, the only one that may become secure.
   */
  private updateStages(solved: number | null): number[] {
    const p = this.progress;
    const unlocked: number[] = [];
    for (const stage of this.stages) {
      const s = this.stageState(stage);
      if (!s.unlocked) continue;
      const def = stageDef(this.rules, stage);
      const correct = s.window.filter((a) => a.ok);
      const varied = new Set(correct.map((a) => a.key)).size >= def.minDistinct;
      const complete = s.steps >= def.steps.length;
      if (!s.ready && complete && s.mastery >= READY_MASTERY && correct.length >= READY_WINDOW_CORRECT && varied) {
        s.ready = true;
        s.readySession = p.session;
        const next = stage + 1;
        if (next <= this.stages.length && !this.stageState(next).unlocked) {
          this.stageState(next).unlocked = true;
          this.stageState(next).steps = 1;
          unlocked.push(next);
          p.forced.push(...stepExamples(this.rules, next, 0));
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
    if (p.reviewQueue.length > MAX_REVIEWS) p.reviewQueue.shift();
  }

  // --- selection -----------------------------------------------------------

  private pickForced(): Task | null {
    const forced = this.progress.forced[0];
    if (!forced) return null;
    this.currentSource = 'forced';
    // An example with a pick shows its key for the first time: only the cards explained before stand next to it.
    return this.makeTask(forced.stage, 'example', this.exampleKey(forced), forced.pick !== undefined);
  }

  private exampleKey({ stage, pick: index }: ForcedTask): string {
    const all = exampleKeys(this.rules, stage);
    if (index !== undefined && all[index]) return all[index];
    const shown = this.askedKeys(stage);
    const fresh = shown.filter((key) => !this.progress.recent.includes(`${stage}:${key}`));
    return pick(fresh.length ? fresh : shown, this.rng);
  }

  private pickReview(): Task | null {
    const p = this.progress;
    // Keys from an older version or a broken sync are dropped.
    p.reviewQueue = p.reviewQueue.filter((r) => validKey(this.rules, r.stage, r.key));
    const last = p.recent[p.recent.length - 1];
    for (const item of p.reviewQueue) {
      if (item.dueAt > p.taskCounter || !this.stageState(item.stage).unlocked || last === `${item.stage}:${item.key}`) continue;
      if (!this.askedKeys(item.stage).includes(item.key)) continue;
      this.currentSource = item;
      return this.makeTask(item.stage, 'review', item.key);
    }
    return null;
  }

  private pickPractice(): Task {
    const stage = this.chooseStage();
    return this.makeTask(stage, 'practice', this.chooseKey(stage));
  }

  /** The newest stage first, the one before as practice, older ones now and then. */
  private chooseStage(): number {
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

  /** Not among the last tasks; keys not yet right in the window now and then first, so every one comes up. */
  private chooseKey(stage: number): string {
    const keys = this.askedKeys(stage);
    const recent = this.progress.recent;
    const right = new Set(this.stageState(stage).window.filter((a) => a.ok).map((a) => a.key));
    const notRecent = keys.filter((k) => !recent.includes(`${stage}:${k}`));
    const missing = notRecent.filter((k) => !right.has(k));
    const notLast = keys.filter((k) => `${stage}:${k}` !== recent[recent.length - 1]);
    // Missing keys only now and then: otherwise the next one is easy to guess.
    const pool = missing.length && this.rng() < 0.5 ? missing : notRecent.length ? notRecent : notLast.length ? notLast : keys;
    return pick(pool, this.rng);
  }

  /**
   * The answers that may stand next to the key's: those of the keys explained
   * in its stage, without the right one and the excluded. `firstShow`: the
   * key's own first example, where only the keys before it are explained.
   */
  distractorPool(stage: number, key: string, firstShow = false): string[] {
    const right = this.rules.answer(stage, key);
    const all = exampleKeys(this.rules, stage);
    const explained = firstShow ? all.slice(0, all.indexOf(key)) : this.askedKeys(stage);
    const answers = explained.map((k) => this.rules.answer(stage, k));
    return [...new Set(answers)].filter((a) => a !== right && !this.rules.excluded?.(stage, key, a));
  }

  /** Builds the task for a key: one explained partner if there is one, the rest at random. */
  makeTask(stage: number, kind: TaskKind, key: string, firstShow = false): Task {
    const right = this.rules.answer(stage, key);
    const pool = this.distractorPool(stage, key, firstShow);
    const partners = (this.rules.partners?.(stage, key) ?? []).filter((a) => pool.includes(a));
    const first = partners.length ? [pick(partners, this.rng)] : [];
    const rest = shuffled(pool.filter((a) => !first.includes(a)), this.rng);
    const others = [...first, ...rest].slice(0, OPTIONS - 1);
    const order = this.rules.order?.(stage);
    const options = order
      ? [right, ...others].sort((a, b) => order.indexOf(a) - order.indexOf(b))
      : shuffled([right, ...others], this.rng);
    return { id: this.progress.taskCounter, stage, kind, key, options, correctIndex: options.indexOf(right) };
  }
}
