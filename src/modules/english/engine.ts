import { STAGE_WORDS, confusable, wordByEn, type Word } from './words';

/**
 * 1: colours; 2: numbers 1–5; 3: pets; 4: numbers 6–10; 5: zoo animals;
 * 6: more colours, 11 and 12; 7: numbers 13–20 (see STAGE_WORDS).
 */
export type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const STAGES: readonly Stage[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Learning points per stage: +MASTERY_CORRECT per independent correct answer,
 * nothing taken away for a mistake and no bonus for speed. READY unlocks the
 * next stage, SECURE earns the badge.
 */
export const MASTERY_CORRECT = 10;
export const READY_MASTERY = 60;
export const SECURE_MASTERY = 100;
export const MAX_MASTERY = 120;
/** Recent independent answers per stage; two or three pictures are easy to guess, so accuracy counts too. */
export const WINDOW = 8;
export const READY_WINDOW_CORRECT = 6;
export const SECURE_WINDOW_CORRECT = 7;
/** Correct answers in the window must cover this many different words. */
export const MIN_DISTINCT_WORDS = 5;
/** A new stage starts with this many words; INTRO_BATCH more join every INTRO_STEP_MASTERY learning points. */
export const INTRO_WORDS = 3;
export const INTRO_BATCH = 2;
export const INTRO_STEP_MASTERY = 20;
/** Below this, a stage still offers two pictures instead of three. */
export const TWO_OPTIONS_MASTERY = 30;
/** Independent correct answers after which a word counts as familiar: then it is also read. */
export const FAMILIAR_CORRECT = 2;
/** Shares among familiar words: read the word and tap the picture, or pick the word for a picture. */
export const READ_SHARE = 0.3;
export const WORD_SHARE = 0.15;
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
/** Tasks between two uses of the same word (a new stage has only three words). */
export const RECENT_SPAN = 2;
export const STREAK_PRAISE = 3;

/** listen: hear the word, tap the picture; read: read the word, tap the picture; word: pick the word for the picture. */
export type Variant = 'listen' | 'read' | 'word';
const VARIANT_KEYS: Record<string, Variant> = { l: 'listen', r: 'read', w: 'word' };
export type Rng = () => number;

export interface Attempt {
  ok: boolean;
  word: string;
}

export interface StageState {
  unlocked: boolean;
  /** Words of STAGE_WORDS introduced so far (from the start of the list). */
  introduced: number;
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

/** A guided example of one word: `isNew` when the word is introduced. */
export interface ForcedTask {
  type: 'example';
  stage: Stage;
  word: string;
  isNew: boolean;
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
  /** Independent correct answers per word (see FAMILIAR_CORRECT). */
  known: Record<string, number>;
  reviewQueue: ReviewItem[];
  forced: ForcedTask[];
  /** Words of the last tasks, so none comes straight back. */
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
  variant: Variant;
  /** Identifies the item for a later review, e.g. "l:red", "r:cat", "w:seven". */
  key: string;
  word: Word;
  /** For an example: the word is introduced just now. */
  isNew: boolean;
  options: Word[];
  correctIndex: number;
  /** A stage she already masters ("Das kannst du schon!"). */
  familiar: boolean;
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

export function stageWords(stage: Stage): readonly string[] {
  return STAGE_WORDS[stage - 1];
}

function introCount(stage: Stage): number {
  return Math.min(INTRO_WORDS, stageWords(stage).length);
}

function newWordExamples(stage: Stage, from: number, to: number): ForcedTask[] {
  return stageWords(stage).slice(from, to).map((word) => ({ type: 'example', stage, word, isNew: true }));
}

function freshStage(unlocked: boolean, stage: Stage): StageState {
  return {
    unlocked, introduced: unlocked ? introCount(stage) : 0,
    attempts: 0, window: [], mastery: 0, ready: false, readySession: null, secure: false,
  };
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
    stages: STAGES.map((s) => freshStage(s === 1, s)),
    known: {},
    reviewQueue: [],
    forced: newWordExamples(1, 0, introCount(1)),
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

/** "l:red" → variant and word; null for a key that does not exist (any more). */
export function parseKey(key: string): { variant: Variant; word: Word } | null {
  const [v, en] = key.split(':');
  const variant = VARIANT_KEYS[v];
  const word = en ? wordByEn(en) : undefined;
  return variant && word ? { variant, word } : null;
}

export class Engine {
  /**
   * Whether the device can speak English. Without a voice, listening becomes
   * reading: the word is shown instead of spoken.
   */
  listen = true;
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

  /** Words of the stage introduced so far. */
  introducedWords(stage: Stage): Word[] {
    return stageWords(stage).slice(0, this.stageState(stage).introduced).map((en) => wordByEn(en)!);
  }

  familiar(word: Word): boolean {
    return (this.progress.known[word.en] ?? 0) >= FAMILIAR_CORRECT;
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
    p.recent = [...p.recent, task.word.en].slice(-RECENT_SPAN);
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
    state.window = [...state.window, { ok, word: task.word.en }].slice(-WINDOW);

    if (ok) {
      state.mastery = Math.min(MAX_MASTERY, state.mastery + MASTERY_CORRECT);
      p.known[task.word.en] = (p.known[task.word.en] ?? 0) + 1;
      this.award(result, POINTS);
      p.correctTotal += 1;
      result.starEarned = p.correctTotal % CORRECT_PER_STAR === 0;
      p.wrongStreak = 0;
      p.correctStreak += 1;
      if (p.correctStreak % STREAK_PRAISE === 0) result.streak = p.correctStreak;
      this.introduceMore(task.stage);
    } else {
      p.correctStreak = 0;
      p.wrongStreak += 1;
      if (p.wrongStreak === 2) {
        p.forced.push({ type: 'example', stage: task.stage, word: task.word.en, isNew: false });
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

  /** The next words of the stage join with a guided example each, a few at a time. */
  private introduceMore(stage: Stage): void {
    const s = this.stageState(stage);
    const total = stageWords(stage).length;
    const target = Math.min(total, INTRO_WORDS + INTRO_BATCH * Math.floor(s.mastery / INTRO_STEP_MASTERY));
    if (target <= s.introduced) return;
    this.progress.forced.push(...newWordExamples(stage, s.introduced, target));
    s.introduced = target;
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
      const allIntroduced = s.introduced >= stageWords(stage).length;
      if (!s.ready && allIntroduced && s.mastery >= READY_MASTERY && correct.length >= READY_WINDOW_CORRECT &&
        new Set(correct.map((a) => a.word)).size >= MIN_DISTINCT_WORDS) {
        s.ready = true;
        s.readySession = p.session;
        const next = (stage + 1) as Stage;
        if (stage < STAGES.length && !this.stageState(next).unlocked) {
          const n = this.stageState(next);
          n.unlocked = true;
          n.introduced = introCount(next);
          unlocked.push(next);
          p.forced.push(...newWordExamples(next, 0, n.introduced));
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
    p.reviewQueue.push({ stage: task.stage, key: task.key, dueAt: p.taskCounter + 3 + Math.floor(this.rng() * 2) });
    if (p.reviewQueue.length > 12) p.reviewQueue.shift();
  }

  // --- selection -----------------------------------------------------------

  private pickForced(): Task | null {
    const p = this.progress;
    // Examples of words removed in an update are dropped.
    while (p.forced[0] && !stageWords(p.forced[0].stage).includes(p.forced[0].word)) p.forced.shift();
    const forced = p.forced[0];
    if (!forced) return null;
    this.currentSource = 'forced';
    const variant: Variant = this.listen ? 'listen' : 'read';
    return this.makeTask(forced.stage, 'example', `${variant[0]}:${forced.word}`, forced.isNew)!;
  }

  private pickReview(): Task | null {
    const p = this.progress;
    // Words removed from the lists in an update (or keys from a broken sync) are dropped.
    p.reviewQueue = p.reviewQueue.filter((r) => this.validKey(r.stage, r.key));
    for (const item of p.reviewQueue) {
      if (item.dueAt > p.taskCounter || !this.stageState(item.stage).unlocked) continue;
      if (p.recent.includes(parseKey(item.key)!.word.en)) continue;
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

  /** Words seen least recently: not among the last tasks, and not yet in the window if possible. */
  private freshWord(stage: Stage): Word {
    const words = this.introducedWords(stage);
    const recent = this.progress.recent;
    const seen = new Set(this.stageState(stage).window.map((a) => a.word));
    const notRecent = words.filter((w) => !recent.includes(w.en));
    const unseen = notRecent.filter((w) => !seen.has(w.en));
    return pick(unseen.length ? unseen : notRecent.length ? notRecent : words, this.rng);
  }

  /** Key of a new task: new words are heard, familiar ones now and then read. */
  private chooseKey(stage: Stage): string {
    const word = this.freshWord(stage);
    let variant: Variant = 'listen';
    if (this.familiar(word)) {
      const r = this.rng();
      if (r < WORD_SHARE) variant = 'word';
      else if (r < WORD_SHARE + READ_SHARE) variant = 'read';
    }
    return `${variant[0]}:${word.en}`;
  }

  private validKey(stage: Stage, key: string): boolean {
    const parsed = parseKey(key);
    return !!parsed && stageWords(stage).includes(parsed.word.en);
  }

  /**
   * Other pictures of the same kind she has met: three colours, three numbers
   * or three animals, never a sound-alike number before both are familiar.
   */
  private distractors(word: Word): Word[] {
    return this.unlockedStages()
      .flatMap((s) => this.introducedWords(s))
      .filter((w) => w !== word && w.category === word.category)
      .filter((w) => !confusable(w, word) || (this.familiar(w) && this.familiar(word)));
  }

  /** Builds the task for a key; null if the key no longer exists (old review). */
  makeTask(stage: Stage, kind: TaskKind, key: string, isNew = false): Task | null {
    if (!this.validKey(stage, key)) return null;
    const parsed = parseKey(key)!;
    const { word } = parsed;
    // Without an English voice nothing can be heard: the word is read instead.
    const variant = parsed.variant === 'listen' && !this.listen ? 'read' : parsed.variant;
    const state = this.stageState(stage);
    const count = !state.ready && state.mastery < TWO_OPTIONS_MASTERY ? 2 : 3;
    const others = shuffled(this.distractors(word), this.rng).slice(0, count - 1);
    const options = shuffled([word, ...others], this.rng);
    return {
      id: this.progress.taskCounter,
      stage,
      kind,
      variant,
      key: `${variant[0]}:${word.en}`,
      word,
      isNew: kind === 'example' && isNew,
      options,
      correctIndex: options.indexOf(word),
      familiar: kind !== 'example' && state.secure,
    };
  }
}
