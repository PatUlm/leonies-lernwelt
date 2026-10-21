/**
 * Umkehraufgaben: a gap task like "__ + 23 = 90" is solved with its inverse
 * "90 − 23", step by step ("schrittweise"): first the tens, then the ones.
 *
 * Nine stages: three ways of writing the inverse (forms) times three kinds of
 * numbers (levels). A new form starts again with the easy numbers, so only one
 * thing is new at a time.
 *
 *   form 1: two lines      90 − 20 = 70, 70 − 3 = 67
 *   form 2: one line       90 − 20 − 3 = 67
 *   form 3: directly       90 − 23 = 67
 *
 *   level 1: no crossing   96 − 23  (76 − 3)
 *   level 2: round tens    90 − 23  (70 − 3 crosses the ten right at the start)
 *   level 3: crossing      93 − 27  (73 − 7: back to the ten, then on)
 */
export type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const STAGES: readonly Stage[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export type Form = 1 | 2 | 3;
export const FORMS: readonly Form[] = [1, 2, 3];
export type Level = 1 | 2 | 3;
export const LEVELS: readonly Level[] = [1, 2, 3];

export function formOf(stage: Stage): Form {
  return Math.ceil(stage / 3) as Form;
}

export function levelOf(stage: Stage): Level {
  return (((stage - 1) % 3) + 1) as Level;
}

export function stageOf(form: Form, level: Level): Stage {
  return ((form - 1) * 3 + level) as Stage;
}

/**
 * Learning points per stage: +MASTERY_CORRECT for a task solved completely on
 * the first try without help; nothing taken away, no bonus for speed.
 * READY unlocks the next stage (ten clean tasks: more practice per stage, the
 * stages stay few), SECURE earns the badge.
 */
export const MASTERY_CORRECT = 10;
export const READY_MASTERY = 100;
export const SECURE_MASTERY = 140;
export const MAX_MASTERY = 160;
export const WINDOW = 10;
export const READY_WINDOW_CORRECT = 8;
export const SECURE_WINDOW_CORRECT = 9;
/** Correct tasks in the window must have this many different sums and as many different known parts. */
export const MIN_DISTINCT = 4;
/**
 * A new way of writing starts with two guided examples; new numbers in a known
 * way of writing with one, which shows only what is new. Stage 2 also shows
 * the start at 100.
 */
export function examplesFor(stage: Stage): number {
  return levelOf(stage) === 1 || stage === 2 ? 2 : 1;
}
/** Share of the newest stage, growing with its mastery; the stage before gets most of the rest. */
export const NEWEST_SHARE_MIN = 0.4;
export const NEWEST_SHARE_MAX = 0.75;
export const MAX_NEWEST_RUN = 3;
export const EASY_SHARE = 0.1;
/** Easy tasks when a new session starts with several stages open. */
export const WARMUP_TASKS = 2;
/** A round is a fixed number of tasks: several steps each need a reliable finish line. */
export const ROUND_TASKS = 8;
export const CORRECT_PER_STAR = 5;
export const LEVEL_POINTS: Record<Level, number> = { 1: 10, 2: 15, 3: 20 };
/** Points for a task finished after a hint or help (about half); none if a result had to be shown. */
export const HELP_POINTS: Record<Level, number> = { 1: 5, 2: 8, 3: 10 };
export const SESSION_GAP_MS = 30 * 60 * 1000;
/** Tasks between two uses of the same sum. */
export const RECENT_SPAN = 4;
export const STREAK_PRAISE = 3;
/** "23 + __ = 90": the gap after the plus, once stage 3 is ready and its example was shown. */
export const BACK_SHAPE_STAGE: Stage = 3;
export const BACK_SHAPE_SHARE = 0.2;
/** Practice in the new form before the example of the moved gap comes. */
export const BACK_EXAMPLE_AFTER = 5;
/** From form 2, once its example was shown: now and then she first chooses the inverse ("90 − 23" or "90 + 23"). */
export const CHOOSE_SHARE = 0.3;
/**
 * In form 3 without crossing a ten, once its example was shown: now and then
 * she types the check sum herself ("73 + 23 = __"). Adding over a ten is not
 * taught here, so the check sum of the other levels stays shown.
 */
export const PROBE_SHARE = 0.3;

/** front: "__ + 23 = 90"; back: "23 + __ = 90". The inverse is "90 − 23" for both. */
export type Shape = 'front' | 'back';

export interface Problem {
  /** The sum of the gap task, the start of the inverse: 90. */
  total: number;
  /** The known part: 23. */
  part: number;
  shape: Shape;
}

export function answerOf(p: Problem): number {
  return p.total - p.part;
}

/** Key of a problem, e.g. "f:90:23" or "b:90:23". */
export function problemKey(p: Problem): string {
  return `${p.shape === 'front' ? 'f' : 'b'}:${p.total}:${p.part}`;
}

/**
 * The level a problem belongs to: does the ones step cross a ten, and does it
 * start right at one? Null if it is no problem of this module (tens and ones in
 * the known part, a two-digit answer, nothing above 100).
 */
export function levelOfProblem(total: number, part: number): Level | null {
  const tens = Math.floor(part / 10);
  const ones = part % 10;
  if (!Number.isInteger(total) || !Number.isInteger(part) || total > 100 || tens < 1 || ones < 1 || total - part < 10) return null;
  const totalOnes = total % 10;
  if (totalOnes === 0) return 2;
  return ones <= totalOnes ? 1 : 3;
}

export function parseKey(key: string): Problem | null {
  const m = /^([fb]):(\d{1,3}):(\d{1,2})$/.exec(key);
  if (!m) return null;
  const total = Number(m[2]);
  const part = Number(m[3]);
  if (levelOfProblem(total, part) === null) return null;
  return { total, part, shape: m[1] === 'f' ? 'front' : 'back' };
}

/** All problems of a level, as [total, part]. */
function problemsOf(level: Level): readonly (readonly [number, number])[] {
  const list: [number, number][] = [];
  for (let total = 21; total <= 100; total++) {
    for (let part = 11; part < total; part++) {
      if (levelOfProblem(total, part) === level) list.push([total, part]);
    }
  }
  return list;
}

export const PROBLEMS: Record<Level, readonly (readonly [number, number])[]> = {
  1: problemsOf(1),
  2: problemsOf(2),
  3: problemsOf(3),
};

/**
 * Guided examples come from fixed lists, so their explanations can be
 * recorded beforehand. Each level keeps its two through all forms.
 */
export const EXAMPLES: Record<Level, readonly (readonly [number, number])[]> = {
  1: [[96, 23], [78, 45]],
  2: [[90, 23], [100, 34]],
  3: [[93, 27], [72, 48]],
};
/** The example of the moved gap: "23 + __ = 96", in the form she has just begun. */
export const BACK_EXAMPLE: { stage: Stage; problem: Problem } = { stage: 4, problem: { total: 96, part: 23, shape: 'back' } };
/** The example of choosing the inverse, after the first examples of one line. */
export const CHOOSE_EXAMPLE: { stage: Stage; problem: Problem } = { stage: 4, problem: { total: 96, part: 23, shape: 'front' } };
/** The example of the check sum, after the first examples of the direct way. */
export const PROBE_EXAMPLE: { stage: Stage; problem: Problem } = { stage: 7, problem: { total: 96, part: 23, shape: 'front' } };
/** The second example of stage 2 starts at 100: before it, no task does. */
const HUNDRED_EXAMPLE: ForcedTask = { type: 'example', stage: 2, pick: 1 };

/** One line to calculate; `result` goes into its field. */
export interface Step {
  kind: 'tens' | 'ones' | 'line' | 'direct' | 'probe';
  /** The numbers left of "=", e.g. [90, 20, 3] for "90 − 20 − 3". */
  terms: number[];
  op: '−' | '+';
  result: number;
  /** The tens line: the ones that come in the next line. */
  later?: number;
}

/**
 * The lines of a task. `expanded`: help brought back the two lines in form 2
 * or 3. The check sum follows when the task asks for it.
 */
export function stepsOf(task: { form: Form; problem: Problem; probe: boolean }, expanded = false): Step[] {
  const { total, part, shape } = task.problem;
  const tens = part - (part % 10);
  const ones = part % 10;
  const answer = total - part;
  const steps: Step[] =
    task.form === 1 || expanded
      ? [
        { kind: 'tens', terms: [total, tens], op: '−', result: total - tens, later: ones },
        { kind: 'ones', terms: [total - tens, ones], op: '−', result: answer },
      ]
      : task.form === 2
        ? [{ kind: 'line', terms: [total, tens, ones], op: '−', result: answer }]
        : [{ kind: 'direct', terms: [total, part], op: '−', result: answer }];
  if (task.probe) steps.push({ kind: 'probe', terms: shape === 'front' ? [answer, part] : [part, answer], op: '+', result: total });
  return steps;
}

/** What a wrong number most likely means, for a fitting hint. */
export type Diagnosis = 'order' | 'added' | 'tensKept' | 'toTen' | 'both' | 'again' | 'probe';

/**
 * A number tells a strategy only now and then: exact patterns first, then
 * "bigger than the start" (subtracting makes it smaller), else "once more".
 *   order:    90 − 20 → 87 (the ones first) or 67 (all at once)
 *   added:    70 − 3 → 73, or anything above the start
 *   both:     90 − 20 − 3 → 70 or 87 (only the tens or only the ones)
 *   tensKept: 70 − 3 → 77, 63 − 7 → 66 (over the ten, but the tens stay)
 *   toTen:    63 − 7 → 64 (the smaller ones from the bigger)
 */
export function diagnose(step: Step, given: number): Diagnosis {
  if (step.kind === 'probe') return 'probe';
  const [start] = step.terms;
  const sub = step.terms.slice(1).reduce((a, b) => a + b, 0);
  if (given === start + sub) return 'added';
  if (step.kind === 'tens') {
    const later = step.later ?? 0;
    if (given === start - later || given === start - sub - later) return 'order';
    return given > start ? 'added' : 'again';
  }
  const ones = sub % 10;
  const tens = sub - ones;
  if (step.kind !== 'ones' && (given === start - tens || given === start - ones)) return 'both';
  const startOnes = start % 10;
  if (ones > startOnes) {
    if (given === step.result + 10) return 'tensKept';
    if (given === start - startOnes - tens + (ones - startOnes)) return 'toTen';
  }
  return given > start ? 'added' : 'again';
}

export interface Attempt {
  ok: boolean;
  total: number;
  part: number;
}

export interface StageState {
  unlocked: boolean;
  /** Independent tasks (no help before the first mistake). */
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

export type ForcedTask =
  | { type: 'example'; stage: Stage; /** Index into EXAMPLES; without one an example not seen recently. */ pick?: number }
  | { type: 'back' }
  | { type: 'choose' }
  | { type: 'probe' }
  | { type: 'easy'; stage?: Stage };

export interface RoundState {
  /** Tasks finished in this round (examples not counted). */
  tasks: number;
  points: number;
  /** Tasks solved completely on the first try. */
  correct: number;
}

export interface Progress {
  version: 1;
  session: number;
  lastActive: number;
  /** When the last task was finished; opening without answering does not count. */
  lastAnswered: number | null;
  taskCounter: number;
  points: number;
  correctTotal: number;
  stages: StageState[];
  reviewQueue: ReviewItem[];
  forced: ForcedTask[];
  /** Sums of the last tasks, so none comes straight back. */
  recent: number[];
  /** Practice tasks of the newest stage in a row. */
  newestRun: number;
  /** The example of "23 + __ = 90" was shown: the moved gap comes in practice too. */
  backShown: boolean;
  /** The example of choosing the inverse was shown: choosing comes in practice too. */
  chooseShown: boolean;
  /** The example of the check sum was shown: she types it now and then. */
  probeShown: boolean;
  /** An example starting at 100 was shown: tasks may start there. */
  hundredShown: boolean;
  wrongStreak: number;
  correctStreak: number;
  round: RoundState;
  trophies: number;
}

export type TaskKind = 'example' | 'practice' | 'review';

export interface Task {
  id: number;
  stage: Stage;
  form: Form;
  level: Level;
  kind: TaskKind;
  key: string;
  problem: Problem;
  /** First choose the inverse: "90 − 23" or "90 + 23". */
  choose: boolean;
  /** Type the check sum at the end; otherwise it is shown. */
  probe: boolean;
}

/** How a task went, reported by the game when its last line is done. */
export interface Outcome {
  /** A wrong number or choice anywhere but in the check sum. */
  mistake: boolean;
  /** Help was asked for before any mistake: the task does not count as her own try. */
  helpFirst: boolean;
  /** Help was used at all. */
  helped: boolean;
  /** A result had to be shown after the second wrong try. */
  shown: boolean;
}

export interface AnswerResult {
  /** Solved completely on the first try without help. */
  ok: boolean;
  points: number;
  starEarned: boolean;
  /** Newly unlocked stages, for a short positive announcement. */
  unlocked: Stage[];
  /** Stages that just became secure (learning badges). */
  secured: Stage[];
  offerPause: boolean;
  /** Set when a multiple of STREAK_PRAISE clean tasks in a row is reached. */
  streak: number | null;
  /** Set when this task completed the round. */
  roundComplete: RoundState | null;
}

export type Rng = () => number;

function introExamples(stage: Stage): ForcedTask[] {
  return Array.from({ length: examplesFor(stage) }, (_, pick) => ({ type: 'example', stage, pick }));
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
    newestRun: 0,
    backShown: false,
    chooseShown: false,
    probeShown: false,
    hundredShown: false,
    wrongStreak: 0,
    correctStreak: 0,
    round: { tasks: 0, points: 0, correct: 0 },
    trophies: 0,
  };
}

function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

export class Engine {
  private current: Task | null = null;
  /**
   * Queue entry behind the current task. It is only removed once the task is
   * finished, so leaving or reloading never loses an example or a review.
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

  /** The moved gap ("23 + __ = 90") is part of the practice. */
  get backShapeOpen(): boolean {
    return this.progress.backShown && this.stageState(BACK_SHAPE_STAGE).ready;
  }

  /** Call on app start and before each task; opens a new session after a long pause. */
  touch(now: number): boolean {
    const p = this.progress;
    const newSession = now - p.lastActive > SESSION_GAP_MS;
    if (newSession) {
      p.session += 1;
      p.wrongStreak = 0;
      // Mistakes from earlier sessions come back early, spread over the first tasks.
      p.reviewQueue.forEach((item, i) => (item.dueAt = p.taskCounter + 2 + WARMUP_TASKS + i * 3));
      // A short warm-up with something she knows, before the newest stage.
      if (this.unlockedStages().length > 1 && !p.forced.length) {
        p.forced.push(...Array.from({ length: WARMUP_TASKS }, (): ForcedTask => ({ type: 'easy' })));
      }
    }
    p.lastActive = now;
    return newSession;
  }

  nextTask(): Task {
    const p = this.progress;
    p.taskCounter += 1;
    this.currentSource = null;
    const task = this.pickForced() ?? this.pickCatchUp() ?? this.pickReview() ?? this.pickPractice();
    const newest = this.unlockedStages().at(-1);
    if (task.kind !== 'example') p.newestRun = task.stage === newest ? p.newestRun + 1 : 0;
    p.recent = [...p.recent, task.problem.total].slice(-RECENT_SPAN);
    this.current = task;
    return task;
  }

  answer(task: Task, outcome: Outcome): AnswerResult {
    if (this.current?.id !== task.id) throw new Error('answer for a task that is not current');
    this.current = null;
    const p = this.progress;
    p.lastAnswered = p.lastActive;
    if (this.currentSource === 'forced') {
      const done = p.forced.shift();
      if (done?.type === 'back') p.backShown = true;
    } else if (this.currentSource) {
      p.reviewQueue = p.reviewQueue.filter((r) => r !== this.currentSource);
    }
    this.currentSource = null;

    const ok = !outcome.mistake && !outcome.helped && !outcome.shown;
    const result: AnswerResult = {
      ok, points: 0, starEarned: false, unlocked: [], secured: [], offerPause: false, streak: null, roundComplete: null,
    };
    if (task.kind === 'example') {
      if (task.choose) p.chooseShown = true;
      if (task.probe) p.probeShown = true;
      if (task.problem.total === 100) p.hundredShown = true;
      return result;
    }
    if (outcome.mistake) this.scheduleReview(task);
    if (outcome.shown && !p.forced.some((f) => f.type === 'example' && f.stage === task.stage)) {
      // Two wrong tries on one line: an example, then something easier.
      p.forced.push({ type: 'example', stage: task.stage }, { type: 'easy', stage: stageOf(task.form, 1) });
    }

    const state = this.stageState(task.stage);
    const wasSecure = STAGES.filter((s) => this.stageState(s).secure);
    if (!outcome.helpFirst) {
      state.attempts += 1;
      state.window = [...state.window, { ok, total: task.problem.total, part: task.problem.part }].slice(-WINDOW);
    }

    if (ok) {
      state.mastery = Math.min(MAX_MASTERY, state.mastery + MASTERY_CORRECT);
      this.award(result, LEVEL_POINTS[task.level]);
      p.correctTotal += 1;
      result.starEarned = p.correctTotal % CORRECT_PER_STAR === 0;
      p.wrongStreak = 0;
      p.correctStreak += 1;
      if (p.correctStreak % STREAK_PRAISE === 0) result.streak = p.correctStreak;
    } else {
      if (!outcome.shown) this.award(result, HELP_POINTS[task.level]);
      p.correctStreak = 0;
      if (outcome.mistake && !outcome.helpFirst) {
        p.wrongStreak += 1;
        if (p.wrongStreak >= 3) {
          result.offerPause = true;
          p.wrongStreak = 0;
        }
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

  private countRound(result: AnswerResult, ok: boolean): void {
    const round = this.progress.round;
    round.tasks += 1;
    round.points += result.points;
    if (ok) round.correct += 1;
    if (round.tasks < ROUND_TASKS) return;
    result.roundComplete = { ...round };
    this.progress.trophies += 1;
    this.progress.round = { tasks: 0, points: 0, correct: 0 };
  }

  /**
   * Marks stages ready or secure and unlocks the next one; returns the unlocked
   * stages. `solved`: the stage just solved, the only one that may become secure.
   */
  private updateStages(solved: Stage | null): Stage[] {
    const p = this.progress;
    const unlocked: Stage[] = [];
    for (const stage of STAGES) {
      const s = this.stageState(stage);
      if (!s.unlocked) continue;
      const correct = s.window.filter((a) => a.ok);
      const varied = new Set(correct.map((a) => a.total)).size >= MIN_DISTINCT && new Set(correct.map((a) => a.part)).size >= MIN_DISTINCT;
      if (!s.ready && s.mastery >= READY_MASTERY && correct.length >= READY_WINDOW_CORRECT && varied) {
        s.ready = true;
        s.readySession = p.session;
        const next = (stage + 1) as Stage;
        if (stage < 9 && !this.stageState(next).unlocked) {
          this.stageState(next).unlocked = true;
          unlocked.push(next);
          p.forced.push(...introExamples(next));
          p.newestRun = 0;
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
    if (forced.type === 'back') return this.makeTask(BACK_EXAMPLE.stage, 'example', problemKey(BACK_EXAMPLE.problem));
    if (forced.type === 'choose') return this.makeTask(CHOOSE_EXAMPLE.stage, 'example', problemKey(CHOOSE_EXAMPLE.problem), { choose: true });
    if (forced.type === 'probe') return this.makeTask(PROBE_EXAMPLE.stage, 'example', problemKey(PROBE_EXAMPLE.problem), { probe: true });
    if (forced.type === 'easy') {
      const stage = forced.stage && this.stageState(forced.stage).unlocked ? forced.stage : this.easyStage();
      return this.practiceTask(stage);
    }
    const pool = EXAMPLES[levelOf(forced.stage)];
    const index = forced.pick !== undefined && pool[forced.pick] ? forced.pick : undefined;
    // The start at 100 is explained by its own example in stage 2, not by one picked after a mistake.
    const known = pool.filter(([total]) => total < 100 || this.progress.hundredShown);
    const fresh = known.filter(([total]) => !this.progress.recent.includes(total));
    const [total, part] = index !== undefined ? pool[index] : pick(fresh.length ? fresh : known, this.rng);
    return this.makeTask(forced.stage, 'example', problemKey({ total, part, shape: 'front' }));
  }

  /**
   * Examples of what comes next in a stage already open: choosing the inverse
   * and the check sum right after the first examples of their form, the start
   * at 100 for whoever passed stage 2 before it had that example, and the
   * moved gap once stage 3 is ready and the next form was practised a little.
   */
  private pickCatchUp(): Task | null {
    const p = this.progress;
    const open = (stage: Stage) => this.stageState(stage).unlocked;
    const next = this.stageState(BACK_EXAMPLE.stage);
    let forced: ForcedTask | null = null;
    if (!p.chooseShown && open(CHOOSE_EXAMPLE.stage)) forced = { type: 'choose' };
    else if (!p.probeShown && open(PROBE_EXAMPLE.stage)) forced = { type: 'probe' };
    else if (!p.hundredShown && STAGES.some((s) => levelOf(s) === 2 && open(s))) forced = HUNDRED_EXAMPLE;
    else if (!p.backShown && this.stageState(BACK_SHAPE_STAGE).ready && next.unlocked && next.attempts >= BACK_EXAMPLE_AFTER) forced = { type: 'back' };
    if (!forced) return null;
    p.forced.unshift(forced);
    return this.pickForced();
  }

  private pickReview(): Task | null {
    const p = this.progress;
    // Keys from an older version or a broken sync are dropped.
    p.reviewQueue = p.reviewQueue.filter((r) => this.makeTask(r.stage, 'review', r.key));
    for (const item of p.reviewQueue) {
      if (item.dueAt > p.taskCounter || !this.stageState(item.stage).unlocked) continue;
      const task = this.makeTask(item.stage, 'review', item.key)!;
      if (p.recent.includes(task.problem.total)) continue;
      this.currentSource = item;
      return task;
    }
    return null;
  }

  private pickPractice(): Task {
    return this.practiceTask(this.chooseStage());
  }

  private practiceTask(stage: Stage): Task {
    const shape: Shape = this.backShapeOpen && this.rng() < BACK_SHAPE_SHARE ? 'back' : 'front';
    const [total, part] = this.freshProblem(stage);
    return this.makeTask(stage, 'practice', problemKey({ total, part, shape }))!;
  }

  /** A stage she already knows, for warm-up and after a hard moment: the one before the newest if possible. */
  private easyStage(): Stage {
    const open = this.unlockedStages();
    const ready = open.filter((s) => this.stageState(s).ready && s !== open[open.length - 1]);
    return ready.length ? ready[ready.length - 1] : open[0];
  }

  /** The newest stage first, the one before as practice, older ones now and then. */
  private chooseStage(): Stage {
    const open = this.unlockedStages();
    if (open.length === 1) return open[0];
    const newest = open[open.length - 1];
    const previous = open[open.length - 2];
    const older = open.slice(0, -2);
    if (this.progress.newestRun >= MAX_NEWEST_RUN) return older.length && this.rng() < EASY_SHARE ? pick(older, this.rng) : previous;
    const mastery = Math.min(1, this.stageState(newest).mastery / READY_MASTERY);
    const share = NEWEST_SHARE_MIN + (NEWEST_SHARE_MAX - NEWEST_SHARE_MIN) * mastery;
    const r = this.rng();
    if (r < share) return newest;
    if (!older.length || r < 1 - EASY_SHARE) return previous;
    return pick(older, this.rng);
  }

  /** A problem of the stage's level whose sum was not used lately, preferably not yet in the window. */
  private freshProblem(stage: Stage): readonly [number, number] {
    const all = PROBLEMS[levelOf(stage)].filter(([total]) => total < 100 || this.progress.hundredShown);
    const recent = this.progress.recent;
    const seen = this.stageState(stage).window;
    const notRecent = all.filter(([total]) => !recent.includes(total));
    const unseen = notRecent.filter(([total, part]) => !seen.some((a) => a.total === total || a.part === part));
    return pick(unseen.length ? unseen : notRecent.length ? notRecent : all, this.rng);
  }

  /**
   * Builds the task for a key; null if the key does not fit the stage (old
   * review). Practice chooses and checks only after their examples; an
   * example does so when `show` asks for it.
   */
  makeTask(stage: Stage, kind: TaskKind, key: string, show: { choose?: boolean; probe?: boolean } = {}): Task | null {
    const problem = parseKey(key);
    const level = levelOf(stage);
    if (!problem || levelOfProblem(problem.total, problem.part) !== level) return null;
    const form = formOf(stage);
    const practice = kind !== 'example';
    return {
      id: this.progress.taskCounter,
      stage,
      form,
      level,
      kind,
      key,
      problem,
      choose: practice ? form >= 2 && this.progress.chooseShown && this.rng() < CHOOSE_SHARE : !!show.choose,
      probe: practice ? form === 3 && level === 1 && this.progress.probeShown && this.rng() < PROBE_SHARE : !!show.probe,
    };
  }
}
