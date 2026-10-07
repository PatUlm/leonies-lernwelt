import { describe, expect, it } from 'vitest';
import {
  EXAMPLES_PER_STAGE, Engine, HELP_POINTS, MASTERY_CORRECT, RECENT_SPAN, ROUND_TASKS, SESSION_GAP_MS, STAGE_POINTS,
  freshProgress, type Stage, type Task,
} from '../../src/modules/articles/engine';
import { capitalize, indefinite } from '../../src/modules/articles/words';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;

function wrongIndex(t: Task): number {
  return t.correctIndex === 0 ? 1 : 0;
}

/** Answers `n` tasks (examples included) correctly unless `ok` says otherwise. */
function play(engine: Engine, n: number, ok: (t: Task) => boolean = () => true, now = T0): Task[] {
  const tasks: Task[] = [];
  for (let i = 0; i < n; i++) {
    engine.touch(now);
    const t = engine.nextTask();
    tasks.push(t);
    engine.answer(t, t.kind === 'example' || ok(t) ? t.correctIndex : wrongIndex(t), false);
  }
  return tasks;
}

/** Plays correctly until `stage` is unlocked. */
function reach(engine: Engine, stage: Stage): void {
  for (let i = 0; i < 400 && !engine.stageState(stage).unlocked; i++) play(engine, 1);
  expect(engine.stageState(stage).unlocked).toBe(true);
}

describe('articles engine', () => {
  it('starts with guided examples of "der, die oder das?" that earn nothing', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    const [first, second] = play(engine, EXAMPLES_PER_STAGE);
    expect([first.kind, second.kind]).toEqual(['example', 'example']);
    expect(first.variant).toBe('article');
    expect(engine.progress.round.tasks).toBe(0);
    expect(engine.progress.points).toBe(0);
    expect(engine.stageState(1).mastery).toBe(0);
  });

  it('asks for the article of the noun with der, die and das', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    // Two examples and six answers: just before "ein oder eine?" opens.
    for (const t of play(engine, 8)) {
      expect(t.options).toEqual(['der', 'die', 'das']);
      expect(t.options[t.correctIndex]).toBe(t.article);
    }
  });

  it('unlocks "ein oder eine?" after enough correct answers on different words, with two examples', () => {
    const engine = new Engine(freshProgress(T0), seeded(3));
    reach(engine, 2);
    const s1 = engine.stageState(1);
    expect(s1.ready).toBe(true);
    expect(new Set(s1.window.filter((a) => a.ok).map((a) => a.word)).size).toBeGreaterThanOrEqual(5);
    const next = play(engine, 2);
    expect(next.map((t) => [t.kind, t.stage])).toEqual([['example', 2], ['example', 2]]);
  });

  it('shows "der Apfel" as a bridge while ein/eine is new, and maps der/das to ein, die to eine', () => {
    const engine = new Engine(freshProgress(T0), seeded(4));
    reach(engine, 2);
    const tasks = play(engine, 30).filter((t) => t.stage === 2);
    expect(tasks.length).toBeGreaterThan(5);
    for (const t of tasks) {
      expect(t.options).toEqual(['ein', 'eine']);
      expect(t.options[t.correctIndex]).toBe(indefinite(t.article!));
    }
    expect(tasks[0].showDefinite).toBe(true);
    expect(tasks.at(-1)!.showDefinite).toBe(false);
  });

  it('never takes learning points away for a mistake', () => {
    const engine = new Engine(freshProgress(T0), seeded(5));
    play(engine, 2 + 3);
    const before = engine.stageState(1).mastery;
    expect(before).toBe(3 * MASTERY_CORRECT);
    play(engine, 1, () => false);
    expect(engine.stageState(1).mastery).toBe(before);
  });

  it('brings a mistaken word back a few tasks later', () => {
    const engine = new Engine(freshProgress(T0), seeded(6));
    play(engine, 2);
    const [missed] = play(engine, 1, () => false);
    const later = play(engine, RECENT_SPAN + 3);
    const review = later.find((t) => t.kind === 'review');
    expect(review?.key).toBe(missed.key);
    expect(engine.progress.reviewQueue).toHaveLength(0);
  });

  it('shows an example after two mistakes in a row and offers a pause after three', () => {
    const engine = new Engine(freshProgress(T0), seeded(7));
    play(engine, 2);
    play(engine, 2, () => false);
    expect(engine.progress.forced).toEqual([{ type: 'example', stage: 1 }]);
    play(engine, 1); // the example
    engine.touch(T0);
    const t = engine.nextTask();
    expect(engine.answer(t, wrongIndex(t), false).offerPause).toBe(true);
  });

  it('gives a trophy after ten tasks, right or wrong', () => {
    const engine = new Engine(freshProgress(T0), seeded(8));
    play(engine, 2);
    play(engine, ROUND_TASKS - 1, (t) => t.id % 2 === 0);
    engine.touch(T0);
    const t = engine.nextTask();
    const result = engine.answer(t, t.correctIndex, false);
    expect(result.roundComplete?.tasks).toBe(ROUND_TASKS);
    expect(engine.progress.trophies).toBe(1);
    expect(engine.progress.round.tasks).toBe(0);
  });

  it('gives half the points after help and no learning points', () => {
    const engine = new Engine(freshProgress(T0), seeded(9));
    play(engine, 2);
    engine.touch(T0);
    const t = engine.nextTask();
    const result = engine.answer(t, t.correctIndex, true);
    expect(result.points).toBe(HELP_POINTS[1]);
    expect(HELP_POINTS[1]).toBeLessThan(STAGE_POINTS[1]);
    expect(engine.stageState(1).mastery).toBe(0);
  });

  it('makes a stage secure only when practised again in a later session', () => {
    const engine = new Engine(freshProgress(T0), seeded(10));
    reach(engine, 2);
    for (let i = 0; i < 400 && engine.stageState(1).mastery < 100; i++) play(engine, 1);
    expect(engine.stageState(1).mastery).toBeGreaterThanOrEqual(100);
    expect(engine.stageState(1).secure).toBe(false);
    const nextDay = T0 + SESSION_GAP_MS + 1;
    let secured = false;
    for (let i = 0; i < 60 && !secured; i++) {
      engine.touch(nextDay);
      const t = engine.nextTask();
      const result = engine.answer(t, t.correctIndex, false);
      secured = result.secured.includes(1);
      // Only a right answer of that very stage makes it secure.
      if (secured) expect(t.stage).toBe(1);
    }
    expect(secured).toBe(true);
  });

  it('does not make a stage secure through answers to another stage', () => {
    const engine = new Engine(freshProgress(T0), seeded(15));
    reach(engine, 2);
    for (let i = 0; i < 400 && engine.stageState(1).mastery < 100; i++) play(engine, 1);
    engine.touch(T0 + SESSION_GAP_MS + 1);
    // Next day: only stage-2 tasks, one wrong, one right.
    engine.progress.forced = [];
    engine.progress.recent = [];
    engine.progress.reviewQueue = [{ stage: 2, key: 'Apfel', dueAt: 0 }, { stage: 2, key: 'Katze', dueAt: 0 }];
    for (const ok of [false, true]) {
      const t = engine.nextTask();
      expect(t.stage).toBe(2);
      expect(engine.answer(t, ok ? t.correctIndex : wrongIndex(t), false).secured).not.toContain(1);
    }
    expect(engine.stageState(1).secure).toBe(false);
  });

  it('does not repeat a word within the last tasks', () => {
    const engine = new Engine(freshProgress(T0), seeded(11));
    const tasks = play(engine, 60).filter((t) => t.kind === 'practice');
    for (let i = 1; i < tasks.length; i++) {
      const window = tasks.slice(Math.max(0, i - 2), i).map((t) => t.word);
      expect(window).not.toContain(tasks[i].word);
    }
  });

  it('starts "Nomen entdecken" with single words and adds sentences later', () => {
    const engine = new Engine(freshProgress(T0), seeded(12));
    reach(engine, 3);
    const early = play(engine, 6).filter((t) => t.stage === 3);
    expect(early.length).toBeGreaterThan(0);
    expect(early.every((t) => t.variant === 'noun')).toBe(true);
    reach(engine, 4);
    const later = play(engine, 80).filter((t) => t.stage === 3);
    expect(later.some((t) => t.variant === 'sentence')).toBe(true);
    for (const t of later.filter((x) => x.variant === 'sentence')) {
      expect(t.options[t.correctIndex]).toBe(t.word);
    }
  });

  it('mixes the stories: ein/eine for something new, der/die/das for the same thing again', () => {
    const engine = new Engine(freshProgress(T0), seeded(13));
    reach(engine, 4);
    const stories = play(engine, 150).filter((t) => t.variant === 'story' && t.kind !== 'example');
    for (const kind of ['first', 'known', 'new']) expect(stories.some((t) => t.story!.kind === kind)).toBe(true);
    const atStart = (t: Task) => t.options[0] !== t.options[0].toLowerCase();
    // Neither the sentence nor the place in it gives the answer away.
    for (const answer of ['known', 'new']) {
      const some = stories.filter((t) => t.story!.kind === answer);
      expect(some.some(atStart)).toBe(true);
      expect(some.some((t) => !atStart(t))).toBe(true);
    }
    for (const t of stories) {
      const shown = (s: string) => (atStart(t) ? capitalize(s) : s);
      expect(t.options).toEqual([t.article!, indefinite(t.article!)].map(shown));
      expect(t.options[t.correctIndex]).toBe(shown(t.story!.kind === 'known' ? t.article! : indefinite(t.article!)));
      if (t.story!.kind === 'new') expect(t.story!.before!.word).not.toBe(t.word);
    }
  });

  it('keeps the examples of a story to one thing', () => {
    const engine = new Engine(freshProgress(T0), seeded(15));
    reach(engine, 4);
    const examples = play(engine, 10).filter((t) => t.stage === 4 && t.kind === 'example');
    expect(examples).toHaveLength(EXAMPLES_PER_STAGE);
    for (const t of examples) expect(t.story!.kind).not.toBe('new');
  });

  it('drops reviews whose word no longer exists', () => {
    const engine = new Engine(freshProgress(T0), seeded(14));
    expect(engine.makeTask(1, 'review', 'Dinosaurier')).toBeNull();
    expect(engine.makeTask(3, 'review', 's:999')).toBeNull();
    // Stories of the older format, unknown sentences, a missing or repeated second thing.
    for (const key of ['t:Ball:1:0:1', 't:known:Ball:9:0', 't:known:Ball:0:', 't:new:Ball:0:0', 't:new:Ball:0:0:Ball']) {
      expect(engine.makeTask(4, 'review', key), key).toBeNull();
    }
    engine.progress.forced = [];
    engine.progress.reviewQueue = [{ stage: 1, key: 'Dinosaurier', dueAt: 0 }];
    expect(engine.nextTask().kind).toBe('practice');
  });
});
