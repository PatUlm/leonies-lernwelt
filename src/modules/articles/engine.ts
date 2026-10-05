import {
  ARTICLES, DISCOVER_NOUNS, NOT_NOUNS, NOUNS, SENTENCES, STORY_ENDS, STORY_STARTS, capitalize, indefinite,
  type Article, type Sentence,
} from './words';

/**
 * 1: "der, die oder das?"; 2: "ein oder eine?"; 3: "Nomen entdecken" (single
 * words, later in a sentence); 4: first mention or known thing ("Da ist ein
 * Ball. Der Ball ist schön.").
 */
export type Stage = 1 | 2 | 3 | 4;
export const STAGES: readonly Stage[] = [1, 2, 3, 4];

/**
 * Learning points per stage: +MASTERY_CORRECT per independent correct answer,
 * nothing taken away for a mistake and no bonus for speed – reading and
 * thinking take their time. READY unlocks the next stage, SECURE earns the badge.
 */
export const MASTERY_CORRECT = 10;
export const READY_MASTERY = 60;
export const SECURE_MASTERY = 100;
export const MAX_MASTERY = 120;
/** Recent independent answers per stage. Two answer buttons are easy to guess, so accuracy counts too. */
export const WINDOW = 8;
export const READY_WINDOW_CORRECT = 6;
export const SECURE_WINDOW_CORRECT = 7;
/** Correct answers in the window must cover this many different words. */
export const MIN_DISTINCT_WORDS = 5;
export const EXAMPLES_PER_STAGE = 2;
/** Below this, "ein oder eine?" still shows "der Apfel" and "Nomen entdecken" only single words. */
export const INTRO_MASTERY = 30;
/** Share of sentences in "Nomen entdecken" after the introduction. */
export const SENTENCE_SHARE = 0.4;
/** Share of real nouns among the single words. */
export const NOUN_SHARE = 0.55;
/** Share of the newest stage once several are open; the one before gets most of the rest. */
export const NEWEST_SHARE = 0.6;
export const EASY_SHARE = 0.1;
/** A round is a fixed number of tasks, so a hard round never drags on. */
export const ROUND_TASKS = 10;
export const CORRECT_PER_STAR = 5;
export const STAGE_POINTS: Record<Stage, number> = { 1: 10, 2: 10, 3: 15, 4: 20 };
/** Points for a correct answer after using help (about half). */
export const HELP_POINTS: Record<Stage, number> = { 1: 5, 2: 5, 3: 5, 4: 10 };
export const SESSION_GAP_MS = 30 * 60 * 1000;
/** Tasks between two uses of the same word. */
export const RECENT_SPAN = 5;
export const STREAK_PRAISE = 3;

export type Variant = 'article' | 'indefinite' | 'noun' | 'sentence' | 'story';
export type Rng = () => number;

export interface Attempt {
  ok: boolean;
  word: string;
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
  /** Words of the last tasks, so none comes straight back. */
  recent: string[];
  wrongStreak: number;
  correctStreak: number;
  round: RoundState;
  trophies: number;
}

export type TaskKind = 'example' | 'practice' | 'review';

export interface StoryGap {
  start: number;
  end: number;
  /** 0: the gap is the first mention (ein/eine), 1: the thing is known (der/die/das). */
  gap: 0 | 1;
}

export interface Task {
  id: number;
  stage: Stage;
  kind: TaskKind;
  variant: Variant;
  /** Identifies the item for a later review, e.g. "Apfel", "w:weich", "s:3", "t:Ball:1:0:1". */
  key: string;
  /** The word the task is about (for "Nomen entdecken" possibly no noun). */
  word: string;
  /** Article of the noun; null for a word that is no noun. */
  article: Article | null;
  emoji?: string;
  sentence?: Sentence;
  story?: StoryGap;
  /** "ein oder eine?" at the start: "der Apfel" is shown as a bridge. */
  showDefinite: boolean;
  options: string[];
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
    forced: Array.from({ length: EXAMPLES_PER_STAGE }, () => ({ type: 'example', stage: 1 })),
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

const NOUN_OPTIONS = ['Nomen', 'kein Nomen'];

/** Without its final punctuation: the word as an answer button. */
export function bare(word: string): string {
  return word.replace(/[.!?]$/, '');
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
    p.recent = [...p.recent, task.word].slice(-RECENT_SPAN);
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
      if (ok) this.award(result, HELP_POINTS[task.stage]);
      this.countRound(result, false);
      return result;
    }

    const state = this.stageState(task.stage);
    const wasSecure = STAGES.filter((s) => this.stageState(s).secure);
    state.attempts += 1;
    state.window = [...state.window, { ok, word: task.word }].slice(-WINDOW);
    if (ok) state.mastery = Math.min(MAX_MASTERY, state.mastery + MASTERY_CORRECT);

    if (ok) {
      this.award(result, STAGE_POINTS[task.stage]);
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
      if (!s.ready && s.mastery >= READY_MASTERY && correct.length >= READY_WINDOW_CORRECT &&
        new Set(correct.map((a) => a.word)).size >= MIN_DISTINCT_WORDS) {
        s.ready = true;
        s.readySession = p.session;
        const next = (stage + 1) as Stage;
        if (stage < 4 && !this.stageState(next).unlocked) {
          this.stageState(next).unlocked = true;
          unlocked.push(next);
          for (let i = 0; i < EXAMPLES_PER_STAGE; i++) p.forced.push({ type: 'example', stage: next });
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
    return this.makeTask(forced.stage, 'example', this.chooseKey(forced.stage, true));
  }

  private pickReview(): Task | null {
    const p = this.progress;
    // Words removed from the lists in an update (or keys from a broken sync) are dropped.
    p.reviewQueue = p.reviewQueue.filter((r) => this.makeTask(r.stage, 'review', r.key));
    for (const item of p.reviewQueue) {
      if (item.dueAt > p.taskCounter || !this.stageState(item.stage).unlocked) continue;
      const task = this.makeTask(item.stage, 'review', item.key)!;
      if (p.recent.includes(task.word)) continue;
      this.currentSource = item;
      return task;
    }
    return null;
  }

  private pickPractice(): Task {
    const stage = this.chooseStage();
    return this.makeTask(stage, 'practice', this.chooseKey(stage, false))!;
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
  private fresh<T>(items: readonly T[], word: (item: T) => string, stage: Stage): T {
    const recent = this.progress.recent;
    const seen = new Set(this.stageState(stage).window.map((a) => a.word));
    const notRecent = items.filter((i) => !recent.includes(word(i)));
    const unseen = notRecent.filter((i) => !seen.has(word(i)));
    return pick(unseen.length ? unseen : notRecent.length ? notRecent : items, this.rng);
  }

  /** Key of a new item for the stage. */
  private chooseKey(stage: Stage, example: boolean): string {
    const state = this.stageState(stage);
    const intro = !state.ready && state.mastery < INTRO_MASTERY;
    switch (stage) {
      case 1:
      case 2:
        return this.fresh(NOUNS, (n) => n.word, stage).word;
      case 3: {
        if (!example && !intro && this.rng() < SENTENCE_SHARE) {
          const i = SENTENCES.indexOf(this.fresh(SENTENCES, (s) => bare(s.words[s.noun]), stage));
          return `s:${i}`;
        }
        if (this.rng() < NOUN_SHARE) return `w:${this.fresh(DISCOVER_NOUNS, (n) => n.word, stage).word}`;
        return `w:${this.fresh(NOT_NOUNS, (w) => w, stage)}`;
      }
      case 4: {
        const noun = this.fresh(NOUNS, (n) => n.word, stage);
        const gap = this.rng() < 0.5 ? 0 : 1;
        const start = Math.floor(this.rng() * STORY_STARTS.length);
        const end = Math.floor(this.rng() * STORY_ENDS.length);
        return `t:${noun.word}:${gap}:${start}:${end}`;
      }
    }
  }

  /** Builds the task for a key; null if the key no longer exists (old review). */
  makeTask(stage: Stage, kind: TaskKind, key: string): Task | null {
    const state = this.stageState(stage);
    const base = {
      id: this.progress.taskCounter,
      stage,
      kind,
      key,
      showDefinite: false,
      familiar: kind !== 'example' && state.secure,
    };
    if (stage === 1 || stage === 2) {
      const noun = NOUNS.find((n) => n.word === key);
      if (!noun) return null;
      const options = stage === 1 ? [...ARTICLES] : ['ein', 'eine'];
      const correct = stage === 1 ? noun.article : indefinite(noun.article);
      return {
        ...base,
        variant: stage === 1 ? 'article' : 'indefinite',
        word: noun.word,
        article: noun.article,
        emoji: noun.emoji,
        showDefinite: stage === 2 && (kind === 'example' || (!state.ready && state.mastery < INTRO_MASTERY)),
        options,
        correctIndex: options.indexOf(correct),
      };
    }
    if (stage === 3) {
      if (key.startsWith('s:')) {
        const sentence = SENTENCES[Number(key.slice(2))];
        if (!sentence) return null;
        return {
          ...base,
          variant: 'sentence',
          word: bare(sentence.words[sentence.noun]),
          article: sentence.article,
          sentence,
          options: sentence.words.map(bare),
          correctIndex: sentence.noun,
        };
      }
      const word = key.slice(2);
      const noun = DISCOVER_NOUNS.find((n) => n.word === word);
      if (!noun && !NOT_NOUNS.includes(word)) return null;
      return {
        ...base,
        variant: 'noun',
        word,
        article: noun?.article ?? null,
        options: [...NOUN_OPTIONS],
        correctIndex: noun ? 0 : 1,
      };
    }
    const [, word, gap, start, end] = key.split(':');
    const noun = NOUNS.find((n) => n.word === word);
    const story: StoryGap = { gap: gap === '1' ? 1 : 0, start: Number(start), end: Number(end) };
    if (!noun || !STORY_STARTS[story.start] || !STORY_ENDS[story.end]) return null;
    // Always "der" before "ein", so the place of a button never gives the answer away.
    // A gap at the start of a sentence shows both capitalised, as they will stand there.
    const options = [noun.article, indefinite(noun.article)].map((o) => (story.gap === 1 ? capitalize(o) : o));
    return {
      ...base,
      variant: 'story',
      word: noun.word,
      article: noun.article,
      emoji: noun.emoji,
      story,
      options,
      correctIndex: story.gap === 0 ? 1 : 0,
    };
  }
}
