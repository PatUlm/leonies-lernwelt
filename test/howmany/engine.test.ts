import { describe, expect, it } from 'vitest';
import { NOUNS, NUMBER_WORDS, nounOf } from '../../src/modules/howmany/content';
import {
  EXAMPLES, Engine, HELP_POINTS, MASTERY_CORRECT, MIN_DISTINCT_COUNTS, MIN_DISTINCT_NOUNS, ONE_SHARE, POINTS, PROBLEMS, READY_MASTERY,
  ROUND_TASKS, SECURE_MASTERY, SESSION_GAP_MS, STAGES, cardsFor, diagnose, freshProgress, gapsOf, parseKey, problemKey, roleOf, sentenceOf,
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

  it('asks one thing at a time: the noun form, then is/are, then the whole sentence', () => {
    const one = { count: 1, noun: ghost };
    const three = { count: 3, noun: ghost };
    expect(sentenceOf(1, one)).toEqual(['ghost']);
    expect(sentenceOf(1, three)).toEqual(['ghosts']);
    expect(sentenceOf(2, one)).toEqual(['there', 'is', 'a', 'ghost']);
    expect(sentenceOf(2, three)).toEqual(['there', 'are', 'ghosts']);
    expect(sentenceOf(3, three)).toEqual(['there', 'are', 'three', 'ghosts']);
    expect([gapsOf(1), gapsOf(2), gapsOf(3)]).toEqual([[0], [1], [0, 1, 2, 3]]);
    expect([roleOf(1, 0), roleOf(2, 1), roleOf(3, 2)]).toEqual(['noun', 'verb', 'number']);
  });

  it('offers the two forms in stages 1 and 2, and three tempting cards in stage 3', () => {
    const rng = seeded(1);
    const one = { count: 1, noun: ghost };
    expect([...cardsFor(1, one, rng)].sort()).toEqual(['ghost', 'ghosts']);
    expect([...cardsFor(2, one, rng)].sort()).toEqual(['are', 'is']);
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
    expect([first.answer, second.answer]).toEqual([['ghost'], ['ghosts']]);
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

  it('shows one thing as often as several in stage 1, in about four of ten tasks in stage 3', () => {
    // All three nouns explained already: with the ghost alone there is only one picture of one thing.
    const progress = freshProgress(T0);
    progress.stages[0].steps = EXAMPLES[1].length;
    const engine = new Engine(progress, seeded(4));
    const first = play(engine, 300, (t) => (t.stage === 1 ? { ...CLEAN, mistake: true } : CLEAN)).filter((t) => t.kind === 'practice');
    const share = (tasks: Task[]) => tasks.filter((t) => t.problem.count === 1).length / tasks.length;
    expect(share(first)).toBeGreaterThan(ONE_SHARE[1] - 0.1);
    expect(share(first)).toBeLessThan(ONE_SHARE[1] + 0.1);
    for (let i = 1; i < first.length; i++) expect(first[i].key).not.toBe(first[i - 1].key);
    reach(engine, 3);
    const whole = play(engine, 400).filter((t) => t.kind === 'practice' && t.stage === 3);
    expect(share(whole)).toBeGreaterThan(ONE_SHARE[3] - 0.1);
    expect(share(whole)).toBeLessThan(ONE_SHARE[3] + 0.1);
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
      const count = EXAMPLES[stage][0].length;
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
  it('asks only nouns and number words its examples showed, the next ones after their own example', () => {
    const engine = new Engine(freshProgress(T0), seeded(31));
    const tasks: Task[] = [];
    for (let i = 0; i < 1500 && !engine.stageState(3).ready; i++) tasks.push(...play(engine, 1));
    const nouns = new Set<string>();
    const numbers = new Set<number>();
    for (const t of tasks) {
      if (t.kind === 'example') {
        nouns.add(t.problem.noun.one);
        if (t.stage === 3) numbers.add(t.problem.count);
        continue;
      }
      expect(nouns.has(t.problem.noun.one), `${t.key} in stage ${t.stage}`).toBe(true);
      if (t.stage === 3) {
        expect(numbers.has(t.problem.count), t.key).toBe(true);
        // The wrong number card too.
        for (const card of t.cards) {
          const n = NUMBER_WORDS.indexOf(card as (typeof NUMBER_WORDS)[number]) + 1;
          if (n) expect(numbers.has(n), card).toBe(true);
        }
      }
    }
    expect([...nouns].sort()).toEqual(['cat', 'dog', 'ghost']);
    expect([...numbers].sort()).toEqual([1, 2, 3, 4, 5]);
    // The very first whole sentence offers no wrong number yet.
    const first = tasks.find((t) => t.kind === 'example' && t.stage === 3)!;
    expect(first.cards.filter((c) => (NUMBER_WORDS as readonly string[]).includes(c))).toEqual(['one']);
  });
});
