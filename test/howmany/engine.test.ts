import { describe, expect, it } from 'vitest';
import { NOUNS, nounOf } from '../../src/modules/howmany/content';
import {
  EXAMPLES, Engine, HELP_POINTS, MASTERY_CORRECT, MIN_DISTINCT_COUNTS, MIN_DISTINCT_NOUNS, POINTS, PROBLEMS, READY_MASTERY,
  ROUND_TASKS, SECURE_MASTERY, SESSION_GAP_MS, STAGES, cardsFor, diagnose, freshProgress, parseKey, problemKey,
  type Outcome, type Stage, type Task,
} from '../../src/modules/howmany/engine';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;
const CLEAN: Outcome = { mistake: false, helped: false, helpFirst: false, shown: false };
const ghost = nounOf('ghost')!;

/** Finishes `n` tasks (examples included), cleanly unless `outcome` says otherwise. */
function play(engine: Engine, n: number, outcome: (t: Task) => Outcome = () => CLEAN, now = T0): Task[] {
  const tasks: Task[] = [];
  for (let i = 0; i < n; i++) {
    engine.touch(now);
    const t = engine.nextTask();
    tasks.push(t);
    engine.answer(t, t.kind === 'example' ? CLEAN : outcome(t));
  }
  return tasks;
}

/** Plays cleanly until `stage` is unlocked. */
function reach(engine: Engine, stage: Stage, now = T0): void {
  for (let i = 0; i < 500 && !engine.stageState(stage).unlocked; i++) play(engine, 1, undefined, now);
  expect(engine.stageState(stage).unlocked).toBe(true);
}

describe('how many problems', () => {
  it('has every number from one to five for every noun', () => {
    expect(PROBLEMS).toHaveLength(NOUNS.length * 5);
    expect(new Set(PROBLEMS.map(problemKey)).size).toBe(PROBLEMS.length);
  });

  it('reads keys back and rejects broken ones', () => {
    expect(parseKey('ghost:3')).toEqual({ count: 3, noun: ghost });
    for (const key of ['ghost:0', 'ghost:6', 'mouse:2', 'ghost', ':2', '']) expect(parseKey(key)).toBeNull();
  });

  it('adds one tempting card per stage', () => {
    const rng = seeded(1);
    const one = { count: 1, noun: ghost };
    expect([...cardsFor(1, one, rng)].sort()).toEqual(['ghost', 'ghosts', 'is', 'one', 'there']);
    expect([...cardsFor(2, one, rng)].sort()).toEqual(['are', 'ghost', 'ghosts', 'is', 'one', 'there']);
    expect([...cardsFor(3, one, rng)].sort()).toEqual(['are', 'ghost', 'ghosts', 'is', 'one', 'there', 'two']);
    // A wrong number next to the right one, inside one to five.
    for (let i = 0; i < 20; i++) {
      const cards = cardsFor(3, { count: 5, noun: ghost }, rng);
      expect(cards).toContain('four');
      expect(cards).toHaveLength(7);
    }
  });

  it('finds the "s" first, then is/are, the number and the order', () => {
    const answer = ['there', 'is', 'one', 'ghost'];
    expect(diagnose(answer, ['there', 'is', 'one', 'ghosts'])).toBe('plural');
    expect(diagnose(answer, ['there', 'are', 'one', 'ghosts'])).toBe('plural');
    expect(diagnose(answer, ['there', 'are', 'one', 'ghost'])).toBe('verb');
    expect(diagnose(['there', 'are', 'three', 'ghosts'], ['there', 'are', 'four', 'ghosts'])).toBe('count');
    expect(diagnose(answer, ['is', 'there', 'one', 'ghost'])).toBe('order');
  });
});

describe('how many engine', () => {
  it('starts with one ghost and three ghosts as guided examples that earn nothing', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    const [first, second] = play(engine, 2);
    expect([first.kind, second.kind]).toEqual(['example', 'example']);
    expect([first.key, second.key]).toEqual(['ghost:1', 'ghost:3']);
    expect(first.answer).toEqual(['there', 'is', 'one', 'ghost']);
    expect(engine.progress.round.tasks).toBe(0);
    expect(engine.progress.points).toBe(0);
  });

  it('gives points and mastery only for a sentence right on the first check without help', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    play(engine, 3);
    expect(engine.progress.points).toBe(POINTS);
    expect(engine.stageState(1).mastery).toBe(MASTERY_CORRECT);
    play(engine, 1, () => ({ ...CLEAN, mistake: true }));
    expect(engine.progress.points).toBe(POINTS + HELP_POINTS);
    expect(engine.stageState(1).mastery).toBe(MASTERY_CORRECT);
    play(engine, 1, () => ({ ...CLEAN, mistake: true, shown: true }));
    expect(engine.progress.points).toBe(POINTS + HELP_POINTS);
    expect(engine.stageState(1).window.map((a) => a.ok)).toEqual([true, false, false]);
  });

  it('does not count a task as her own try when help came before any mistake', () => {
    const engine = new Engine(freshProgress(T0), seeded(3));
    play(engine, 2);
    play(engine, 1, () => ({ ...CLEAN, helped: true, helpFirst: true }));
    expect(engine.stageState(1).attempts).toBe(0);
    expect(engine.progress.points).toBe(HELP_POINTS);
  });

  it('shows "one" in about four of ten tasks and never the same picture twice in a row', () => {
    const engine = new Engine(freshProgress(T0), seeded(4));
    const tasks = play(engine, 400).filter((t) => t.kind === 'practice');
    const share = tasks.filter((t) => t.problem.count === 1).length / tasks.length;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.5);
    for (let i = 1; i < tasks.length; i++) expect(tasks[i].key).not.toBe(tasks[i - 1].key);
  });

  it('brings a mistaken sentence back a few tasks later', () => {
    const engine = new Engine(freshProgress(T0), seeded(5));
    play(engine, 2);
    const [wrong] = play(engine, 1, () => ({ ...CLEAN, mistake: true }));
    const later = play(engine, 8);
    expect(later.some((t) => t.kind === 'review' && t.key === wrong.key)).toBe(true);
  });

  it('after a shown sentence: the example for one or for several again', () => {
    const engine = new Engine(freshProgress(T0), seeded(6));
    play(engine, 2);
    let hard: Task | undefined;
    for (let i = 0; i < 20 && !hard; i++) {
      const [t] = play(engine, 1, (t) => (t.problem.count > 1 ? { ...CLEAN, mistake: true, shown: true } : CLEAN));
      if (t.problem.count > 1 && t.kind !== 'example') hard = t;
    }
    const [example] = play(engine, 1);
    expect(example).toMatchObject({ kind: 'example', stage: 1, key: 'ghost:3' });
  });

  it('unlocks the stages one by one, each with its examples first', () => {
    const engine = new Engine(freshProgress(T0), seeded(7));
    for (const stage of STAGES.slice(1)) {
      reach(engine, stage);
      const prev = engine.stageState((stage - 1) as Stage);
      expect(prev.ready).toBe(true);
      expect(prev.mastery).toBeGreaterThanOrEqual(READY_MASTERY);
      const correct = prev.window.filter((a) => a.ok);
      expect(new Set(correct.map((a) => a.count)).size).toBeGreaterThanOrEqual(MIN_DISTINCT_COUNTS);
      expect(new Set(correct.map((a) => a.noun)).size).toBeGreaterThanOrEqual(MIN_DISTINCT_NOUNS);
      const count = EXAMPLES[stage].length;
      const next = play(engine, count + 1);
      expect(next.slice(0, count).map((t) => [t.kind, t.stage])).toEqual(Array(count).fill(['example', stage]));
      expect(next[count].kind).not.toBe('example');
    }
  });

  it('ends a round after ten tasks with a trophy; examples do not count', () => {
    const engine = new Engine(freshProgress(T0), seeded(8));
    let tasks = 0;
    for (let i = 0; i < 40 && engine.progress.trophies === 0; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      engine.answer(t, CLEAN);
      if (t.kind !== 'example') tasks += 1;
    }
    expect(tasks).toBe(ROUND_TASKS);
    expect(engine.progress.round.tasks).toBe(0);
  });

  it('makes a stage secure only in a later session', () => {
    const engine = new Engine(freshProgress(T0), seeded(9));
    reach(engine, 2);
    for (let i = 0; i < 300 && engine.stageState(1).mastery < SECURE_MASTERY; i++) play(engine, 1);
    expect(engine.stageState(1).secure).toBe(false);
    const later = T0 + SESSION_GAP_MS + 1;
    for (let i = 0; i < 200 && !engine.stageState(1).secure; i++) play(engine, 1, undefined, later);
    expect(engine.stageState(1).secure).toBe(true);
  });

  it('offers a pause after three wrong sentences in a row', () => {
    const engine = new Engine(freshProgress(T0), seeded(10));
    play(engine, 2);
    const results = [0, 1, 2].map(() => {
      engine.touch(T0);
      const t = engine.nextTask();
      return engine.answer(t, t.kind === 'example' ? CLEAN : { ...CLEAN, mistake: true });
    });
    expect(results.map((r) => r.offerPause)).toEqual([false, false, true]);
  });
});
