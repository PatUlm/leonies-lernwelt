import { MAX_COUNT, NOUNS, NUMBER_WORDS, answerWords, nounOf, type Noun } from './content';

/**
 * "How many?": a picture with one to five ghosts, cats or dogs, the question
 * "How many ghosts are there?" and the answer built from word cards. The
 * point is "one ghost" against "two ghosts" (Leonie wrote "There is one
 * ghosts."), so each stage adds one card that tempts:
 *
 *   stage 1: the noun in the other form   (ghost / ghosts)
 *   stage 2: also the other verb          (is / are)
 *   stage 3: also a wrong number          (three / four)
 */
export type Stage = 1 | 2 | 3;
export const STAGES: readonly Stage[] = [1, 2, 3];

/**
 * Learning points per stage: +MASTERY_CORRECT for a sentence built right on
 * the first check without help; nothing taken away, no bonus for speed. READY
 * unlocks the next stage, SECURE earns the badge.
 */
export const MASTERY_CORRECT = 10;
export const READY_MASTERY = 100;
export const SECURE_MASTERY = 140;
export const MAX_MASTERY = 160;
export const WINDOW = 10;
export const READY_WINDOW_CORRECT = 8;
export const SECURE_WINDOW_CORRECT = 9;
/** Correct tasks in the window must have this many different numbers and nouns. */
export const MIN_DISTINCT_COUNTS = 3;
export const MIN_DISTINCT_NOUNS = 2;
/** "one" is where the "s" goes wrong: it comes in about four of ten tasks. */
export const ONE_SHARE = 0.4;
/** Share of the newest stage once several are open; the one before gets most of the rest. */
export const NEWEST_SHARE = 0.6;
export const EASY_SHARE = 0.1;
/** A round is a fixed number of tasks, so a hard round never drags on. */
export const ROUND_TASKS = 10;
export const CORRECT_PER_STAR = 5;
export const POINTS = 10;
/** Points for a sentence finished after help or a mistake (half); none if it had to be shown. */
export const HELP_POINTS = 5;
export const SESSION_GAP_MS = 30 * 60 * 1000;
/** Tasks between two uses of the same picture. */
export const RECENT_SPAN = 3;
export const STREAK_PRAISE = 3;

export interface Problem {
  count: number;
  noun: Noun;
}

/** Key of a problem, e.g. "ghost:3". */
export function problemKey(p: Problem): string {
  return `${p.noun.one}:${p.count}`;
}

export function parseKey(key: string): Problem | null {
  const m = /^([a-z]+):(\d)$/.exec(key);
  const noun = m ? nounOf(m[1]) : undefined;
  const count = m ? Number(m[2]) : 0;
  return noun && count >= 1 && count <= MAX_COUNT ? { count, noun } : null;
}

/** Every picture of the module. */
export const PROBLEMS: readonly Problem[] = NOUNS.flatMap((noun) => NUMBER_WORDS.map((_, i) => ({ count: i + 1, noun })));

/**
 * Guided examples come from fixed lists, so their explanations can be
 * recorded beforehand. Stage 1 shows one ghost and several ghosts.
 */
export const EXAMPLES: Record<Stage, readonly string[]> = {
  1: ['ghost:1', 'ghost:3'],
  2: ['dog:2'],
  3: ['cat:4'],
};

/** The cards of a task: the answer, and per stage one more card that tempts. */
export function cardsFor(stage: Stage, p: Problem, rng: Rng): string[] {
  const one = p.count === 1;
  const cards = [...answerWords(p.count, p.noun), one ? p.noun.many : p.noun.one];
  if (stage >= 2) cards.push(one ? 'are' : 'is');
  if (stage >= 3) {
    const near = p.count === 1 ? 2 : p.count === MAX_COUNT ? MAX_COUNT - 1 : p.count + (rng() < 0.5 ? -1 : 1);
    cards.push(NUMBER_WORDS[near - 1]);
  }
  return shuffled(cards, rng);
}

/** What a wrong sentence most likely means, for a fitting hint: the "s" first, it is the point. */
export type Diagnosis = 'plural' | 'verb' | 'count' | 'order';

export function diagnose(answer: readonly string[], placed: readonly string[]): Diagnosis {
  const [, verb, number, noun] = answer;
  if (!placed.includes(noun)) return 'plural';
  if (!placed.includes(verb)) return 'verb';
  if (!placed.includes(number)) return 'count';
  return 'order';
}

export interface Attempt {
  ok: boolean;
  count: number;
  noun: string;
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

/** A guided example; `pick` indexes EXAMPLES of the stage. */
export interface ForcedTask {
  type: 'example';
  stage: Stage;
  pick: number;
}

export interface RoundState {
  /** Tasks finished in this round (examples not counted). */
  tasks: number;
  points: number;
  /** Sentences right on the first check without help. */
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
  /** Keys of the last tasks, so no picture comes straight back. */
  recent: string[];
  wrongStreak: number;
  correctStreak: number;
  round: RoundState;
  trophies: number;
}

export type TaskKind = 'example' | 'practice' | 'review';

export interface Task {
  id: number;
  stage: Stage;
  kind: TaskKind;
  key: string;
  problem: Problem;
  /** The answer word by word, lower case. */
  answer: string[];
  /** The cards to choose from, shuffled. */
  cards: string[];
}

/** How a task went, reported by the game when the sentence is done. */
export interface Outcome {
  /** A wrong sentence was checked. */
  mistake: boolean;
  /** Help was asked for before any mistake: the task does not count as her own try. */
  helpFirst: boolean;
  /** Help was used at all. */
  helped: boolean;
  /** The sentence had to be shown after the second wrong check. */
  shown: boolean;
}

export interface AnswerResult {
  /** Right on the first check without help. */
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
    p.recent = [...p.recent, task.key].slice(-RECENT_SPAN);
    this.current = task;
    return task;
  }

  answer(task: Task, outcome: Outcome): AnswerResult {
    if (this.current?.id !== task.id) throw new Error('answer for a task that is not current');
    this.current = null;
    const p = this.progress;
    p.lastAnswered = p.lastActive;
    if (this.currentSource === 'forced') p.forced.shift();
    else if (this.currentSource) p.reviewQueue = p.reviewQueue.filter((r) => r !== this.currentSource);
    this.currentSource = null;

    const ok = !outcome.mistake && !outcome.helped && !outcome.shown;
    const result: AnswerResult = {
      ok, points: 0, starEarned: false, unlocked: [], secured: [], offerPause: false, streak: null, roundComplete: null,
    };
    if (task.kind === 'example') return result;
    if (outcome.mistake) this.scheduleReview(task);
    if (outcome.shown && !p.forced.some((f) => f.stage === task.stage)) {
      // Shown after two wrong checks: the example of the stage again, for one thing or several.
      const examples = EXAMPLES[task.stage];
      const fitting = examples.findIndex((key) => (parseKey(key)!.count === 1) === (task.problem.count === 1));
      p.forced.push({ type: 'example', stage: task.stage, pick: Math.max(0, fitting) });
    }

    const state = this.stageState(task.stage);
    const wasSecure = STAGES.filter((s) => this.stageState(s).secure);
    if (!outcome.helpFirst) {
      state.attempts += 1;
      state.window = [...state.window, { ok, count: task.problem.count, noun: task.problem.noun.one }].slice(-WINDOW);
    }

    if (ok) {
      state.mastery = Math.min(MAX_MASTERY, state.mastery + MASTERY_CORRECT);
      this.award(result, POINTS);
      p.correctTotal += 1;
      result.starEarned = p.correctTotal % CORRECT_PER_STAR === 0;
      p.wrongStreak = 0;
      p.correctStreak += 1;
      if (p.correctStreak % STREAK_PRAISE === 0) result.streak = p.correctStreak;
    } else {
      if (!outcome.shown) this.award(result, HELP_POINTS);
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
      const varied = new Set(correct.map((a) => a.count)).size >= MIN_DISTINCT_COUNTS &&
        new Set(correct.map((a) => a.noun)).size >= MIN_DISTINCT_NOUNS;
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
    const p = this.progress;
    // Examples removed in an update are dropped.
    while (p.forced[0] && !EXAMPLES[p.forced[0].stage][p.forced[0].pick]) p.forced.shift();
    const forced = p.forced[0];
    if (!forced) return null;
    this.currentSource = 'forced';
    return this.makeTask(forced.stage, 'example', EXAMPLES[forced.stage][forced.pick])!;
  }

  private pickReview(): Task | null {
    const p = this.progress;
    // Keys from an older version or a broken sync are dropped.
    p.reviewQueue = p.reviewQueue.filter((r) => parseKey(r.key) !== null);
    for (const item of p.reviewQueue) {
      if (item.dueAt > p.taskCounter || !this.stageState(item.stage).unlocked || p.recent.includes(item.key)) continue;
      this.currentSource = item;
      return this.makeTask(item.stage, 'review', item.key)!;
    }
    return null;
  }

  private pickPractice(): Task {
    const stage = this.chooseStage();
    return this.makeTask(stage, 'practice', problemKey(this.freshProblem()))!;
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

  /**
   * One thing in about ONE_SHARE of the tasks, otherwise two to five; never a
   * picture just seen (with all three "one" pictures among the last tasks, several).
   */
  private freshProblem(): Problem {
    const one = this.rng() < ONE_SHARE;
    const fresh = PROBLEMS.filter((p) => !this.progress.recent.includes(problemKey(p)));
    const fitting = fresh.filter((p) => (p.count === 1) === one);
    return pick(fitting.length ? fitting : fresh, this.rng);
  }

  /** Builds the task for a key; null if the key does not exist (any more). */
  makeTask(stage: Stage, kind: TaskKind, key: string): Task | null {
    const problem = parseKey(key);
    if (!problem) return null;
    return {
      id: this.progress.taskCounter,
      stage,
      kind,
      key,
      problem,
      answer: answerWords(problem.count, problem.noun),
      cards: cardsFor(stage, problem, this.rng),
    };
  }
}
