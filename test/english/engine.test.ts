import { describe, expect, it } from 'vitest';
import {
  Engine, HELP_POINTS, INTRO_WORDS, MASTERY_CORRECT, POINTS, ROUND_TASKS, SESSION_GAP_MS, TWO_OPTIONS_MASTERY, freshProgress,
  stageWords,
  type Stage, type Task,
} from '../../src/modules/english/engine';
import { confusable } from '../../src/modules/english/words';
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
  for (let i = 0; i < 1000 && !engine.stageState(stage).unlocked; i++) play(engine, 1);
  expect(engine.stageState(stage).unlocked).toBe(true);
}

describe('english engine', () => {
  it('starts by introducing red, blue and yellow with guided examples that earn nothing', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    const examples = play(engine, INTRO_WORDS);
    expect(examples.map((t) => [t.kind, t.variant, t.word.en, t.isNew])).toEqual([
      ['example', 'listen', 'red', true],
      ['example', 'listen', 'blue', true],
      ['example', 'listen', 'yellow', true],
    ]);
    expect(engine.progress.round.tasks).toBe(0);
    expect(engine.progress.points).toBe(0);
  });

  it('asks only introduced words, with two pictures of the same kind at first and three later', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    const [first] = play(engine, INTRO_WORDS + 1).slice(INTRO_WORDS);
    expect(first.kind).toBe('practice');
    expect(first.variant).toBe('listen');
    expect(first.options).toHaveLength(2);
    expect(['red', 'blue', 'yellow']).toContain(first.word.en);
    for (const o of first.options) expect(['red', 'blue', 'yellow']).toContain(o.en);
    while (engine.stageState(1).mastery < TWO_OPTIONS_MASTERY || engine.progress.forced.length) {
      const [t] = play(engine, 1);
      expect(t.options.every((o) => o.category === t.word.category)).toBe(true);
      expect(t.options[t.correctIndex]).toBe(t.word);
    }
    expect(play(engine, 1)[0].options).toHaveLength(3);
  });

  it('introduces the next two words with an example each after enough learning points', () => {
    const engine = new Engine(freshProgress(T0), seeded(3));
    play(engine, INTRO_WORDS + 2);
    expect(engine.stageState(1).mastery).toBe(2 * MASTERY_CORRECT);
    expect(engine.stageState(1).introduced).toBe(5);
    const next = play(engine, 2);
    expect(next.map((t) => [t.kind, t.word.en, t.isNew])).toEqual([['example', 'green', true], ['example', 'black', true]]);
  });

  it('opens numbers 1 to 5 once all colours are introduced and enough different ones are right', () => {
    const engine = new Engine(freshProgress(T0), seeded(4));
    reach(engine, 2);
    expect(engine.stageState(1).introduced).toBe(stageWords(1).length);
    expect(engine.stageState(1).ready).toBe(true);
    const next = play(engine, INTRO_WORDS);
    expect(next.map((t) => [t.kind, t.stage, t.word.en])).toEqual([
      ['example', 2, 'one'], ['example', 2, 'two'], ['example', 2, 'three'],
    ]);
  });

  it('reads familiar words now and then, and picks the word for a picture', () => {
    const engine = new Engine(freshProgress(T0), seeded(5));
    const tasks = play(engine, 150);
    const variants = new Set(tasks.filter((t) => t.kind === 'practice').map((t) => t.variant));
    expect(variants).toEqual(new Set(['listen', 'read', 'word']));
    for (const t of tasks.filter((x) => x.variant !== 'listen')) expect(engine.progress.known[t.word.en]).toBeGreaterThan(0);
  });

  it('reads instead of listening when the device has no English voice', () => {
    const engine = new Engine(freshProgress(T0), seeded(6));
    engine.listen = false;
    const tasks = play(engine, 20);
    expect(tasks.every((t) => t.variant !== 'listen')).toBe(true);
    expect(tasks[0]).toMatchObject({ kind: 'example', variant: 'read', key: 'r:red' });
  });

  it('keeps sound-alike numbers apart until both are familiar', () => {
    const engine = new Engine(freshProgress(T0), seeded(7));
    reach(engine, 7);
    engine.progress.known = {};
    for (const t of play(engine, 40)) {
      for (const o of t.options) {
        if (o !== t.word && confusable(o, t.word)) {
          throw new Error(`${o.en} next to ${t.word.en} before both were familiar`);
        }
      }
    }
  });

  it('never takes learning points away and brings a mistake back later', () => {
    const engine = new Engine(freshProgress(T0), seeded(8));
    play(engine, INTRO_WORDS + 1);
    const before = engine.stageState(1).mastery;
    const [wrong] = play(engine, 1, () => false);
    expect(engine.stageState(1).mastery).toBe(before);
    const later = play(engine, 8);
    expect(later.some((t) => t.kind === 'review' && t.key === wrong.key)).toBe(true);
  });

  it('gives half the points after help and no learning points', () => {
    const engine = new Engine(freshProgress(T0), seeded(9));
    play(engine, INTRO_WORDS);
    engine.touch(T0);
    const t = engine.nextTask();
    const result = engine.answer(t, t.correctIndex, true);
    expect(result.points).toBe(HELP_POINTS);
    expect(HELP_POINTS).toBe(POINTS / 2);
    expect(engine.stageState(1).mastery).toBe(0);
  });

  it('shows a guided example after two mistakes in a row', () => {
    const engine = new Engine(freshProgress(T0), seeded(10));
    while (engine.stageState(1).introduced < stageWords(1).length || engine.progress.forced.length) play(engine, 1);
    const [, second] = play(engine, 2, () => false);
    const [next] = play(engine, 1);
    expect(next).toMatchObject({ kind: 'example', isNew: false, word: second.word });
  });

  it('makes a stage secure only after a pause, not in one sitting', () => {
    const engine = new Engine(freshProgress(T0), seeded(11));
    reach(engine, 2);
    play(engine, 80, () => true, T0);
    expect(engine.stageState(1).secure).toBe(false);
    const later = T0 + SESSION_GAP_MS + 1;
    for (let i = 0; i < 80 && !engine.stageState(1).secure; i++) play(engine, 1, () => true, later);
    expect(engine.stageState(1).secure).toBe(true);
  });

  it('ends a round after ten tasks with a trophy', () => {
    const engine = new Engine(freshProgress(T0), seeded(12));
    play(engine, INTRO_WORDS);
    let complete = null;
    for (let i = 0; i < ROUND_TASKS; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      const r = engine.answer(t, t.correctIndex, false);
      if (t.kind !== 'example') complete = r.roundComplete ?? complete;
      else i--;
    }
    expect(complete).not.toBeNull();
    expect(engine.progress.trophies).toBe(1);
  });

  it('drops reviews and examples of words that no longer exist', () => {
    const p = freshProgress(T0);
    p.forced = [{ type: 'example', stage: 1, word: 'magenta', isNew: true }, ...p.forced];
    p.reviewQueue = [{ stage: 1, key: 'l:magenta', dueAt: 0 }, { stage: 1, key: 'x:red', dueAt: 0 }];
    const engine = new Engine(p, seeded(13));
    const [first] = play(engine, INTRO_WORDS + 1);
    expect(first.word.en).toBe('red');
    expect(engine.progress.reviewQueue).toEqual([]);
  });
});
