import { describe, expect, it } from 'vitest';
import {
  BACK_EXAMPLE, EXAMPLES, Engine, HELP_POINTS, LEVEL_POINTS, MASTERY_CORRECT, MIN_DISTINCT, PROBLEMS, READY_MASTERY,
  ROUND_TASKS, SECURE_MASTERY, SESSION_GAP_MS, STAGES, WARMUP_TASKS, answerOf, examplesFor, formOf, freshProgress, levelOf, levelOfProblem,
  parseKey, problemKey,
  type Outcome, type Stage, type Task,
} from '../../src/modules/inverse/engine';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;
const CLEAN: Outcome = { mistake: false, helped: false, helpFirst: false, shown: false };

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
  for (let i = 0; i < 2000 && !engine.stageState(stage).unlocked; i++) play(engine, 1, undefined, now);
  expect(engine.stageState(stage).unlocked).toBe(true);
}

describe('inverse problems', () => {
  it('sorts problems into the three levels by their ones step', () => {
    expect(levelOfProblem(96, 23)).toBe(1); // 76 − 3
    expect(levelOfProblem(90, 23)).toBe(2); // 70 − 3
    expect(levelOfProblem(100, 23)).toBe(2); // 80 − 3
    expect(levelOfProblem(93, 27)).toBe(3); // 73 − 7
    expect(levelOfProblem(90, 30)).toBeNull(); // no ones to subtract
    expect(levelOfProblem(35, 27)).toBeNull(); // answer below ten
    expect(levelOfProblem(101, 23)).toBeNull();
  });

  it('keeps every problem in the number space up to 100 with a two-digit answer', () => {
    for (const level of [1, 2, 3] as const) {
      expect(PROBLEMS[level].length).toBeGreaterThan(50);
      for (const [total, part] of PROBLEMS[level]) {
        expect(levelOfProblem(total, part)).toBe(level);
        expect(total).toBeLessThanOrEqual(100);
        expect(total - part).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('takes the examples from fixed lists of the right level', () => {
    for (const level of [1, 2, 3] as const) {
      for (const [total, part] of EXAMPLES[level]) expect(levelOfProblem(total, part)).toBe(level);
    }
    expect(EXAMPLES[2][0]).toEqual([90, 23]);
  });

  it('reads keys back and rejects broken ones', () => {
    expect(parseKey('f:90:23')).toEqual({ total: 90, part: 23, shape: 'front' });
    expect(parseKey(problemKey({ total: 93, part: 27, shape: 'back' }))).toEqual({ total: 93, part: 27, shape: 'back' });
    for (const key of ['x:90:23', 'f:90', 'f:90:30', 'f:120:23', '']) expect(parseKey(key)).toBeNull();
  });
});

describe('inverse engine', () => {
  it('starts with the two guided examples of stage 1 that earn nothing', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    const [first, second] = play(engine, 2);
    expect([first.kind, second.kind]).toEqual(['example', 'example']);
    expect([first.key, second.key]).toEqual(['f:96:23', 'f:78:45']);
    expect(engine.progress.round.tasks).toBe(0);
    expect(engine.progress.points).toBe(0);
    expect(engine.stageState(1).mastery).toBe(0);
  });

  it('gives points and mastery only for a task solved cleanly', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    play(engine, 2);
    play(engine, 1);
    expect(engine.progress.points).toBe(LEVEL_POINTS[1]);
    expect(engine.stageState(1).mastery).toBe(MASTERY_CORRECT);
    play(engine, 1, () => ({ ...CLEAN, mistake: true }));
    expect(engine.progress.points).toBe(LEVEL_POINTS[1] + HELP_POINTS[1]);
    expect(engine.stageState(1).mastery).toBe(MASTERY_CORRECT);
    expect(engine.stageState(1).window.map((a) => a.ok)).toEqual([true, false]);
    play(engine, 1, () => ({ ...CLEAN, mistake: true, shown: true }));
    expect(engine.progress.points).toBe(LEVEL_POINTS[1] + HELP_POINTS[1]);
  });

  it('does not count a task as her own try when help came before any mistake', () => {
    const engine = new Engine(freshProgress(T0), seeded(3));
    play(engine, 2);
    play(engine, 1, () => ({ ...CLEAN, helped: true, helpFirst: true }));
    expect(engine.stageState(1).attempts).toBe(0);
    expect(engine.progress.points).toBe(HELP_POINTS[1]);
    play(engine, 1, () => ({ ...CLEAN, helped: true, mistake: true }));
    expect(engine.stageState(1).attempts).toBe(1);
  });

  it('brings a mistaken problem back a few tasks later', () => {
    const engine = new Engine(freshProgress(T0), seeded(4));
    play(engine, 2);
    const [wrong] = play(engine, 1, () => ({ ...CLEAN, mistake: true }));
    const later = play(engine, 8);
    expect(later.some((t) => t.kind === 'review' && t.key === wrong.key)).toBe(true);
  });

  it('after a shown result: an example of the stage, then an easy task', () => {
    const engine = new Engine(freshProgress(T0), seeded(5));
    reach(engine, 3);
    play(engine, 2);
    const [hard] = play(engine, 1, () => ({ ...CLEAN, mistake: true, shown: true }));
    const [example, easy] = play(engine, 2);
    expect(example).toMatchObject({ kind: 'example', stage: hard.stage });
    expect(easy.stage).toBe((formOf(hard.stage) - 1) * 3 + 1);
  });

  it('opens the next stage after exactly ten clean tasks, not after nine', () => {
    const engine = new Engine(freshProgress(T0), seeded(15));
    play(engine, 2);
    const tasks = play(engine, 9);
    expect(tasks.every((t) => t.kind === 'practice' && t.stage === 1)).toBe(true);
    expect(engine.stageState(2).unlocked).toBe(false);
    play(engine, 1);
    expect(engine.stageState(2).unlocked).toBe(true);
    const correct = engine.stageState(1).window.filter((a) => a.ok);
    expect(correct).toHaveLength(10);
    expect(new Set(correct.map((a) => a.total)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(correct.map((a) => a.part)).size).toBeGreaterThanOrEqual(4);
  });

  it('unlocks the stages one by one after ten clean tasks: two examples for a new way of writing, one for new numbers', () => {
    const engine = new Engine(freshProgress(T0), seeded(6));
    for (const stage of STAGES.slice(1)) {
      reach(engine, stage);
      const prev = engine.stageState((stage - 1) as Stage);
      expect(prev.ready).toBe(true);
      const correct = prev.window.filter((a) => a.ok);
      expect(prev.mastery).toBeGreaterThanOrEqual(READY_MASTERY);
      expect(correct.length).toBeGreaterThanOrEqual(8);
      expect(new Set(correct.map((a) => a.total)).size).toBeGreaterThanOrEqual(MIN_DISTINCT);
      expect(new Set(correct.map((a) => a.part)).size).toBeGreaterThanOrEqual(MIN_DISTINCT);
      const count = examplesFor(stage);
      expect(count).toBe(levelOf(stage) === 1 ? 2 : 1);
      const next = play(engine, count + 1);
      expect(next.map((t) => [t.kind, t.stage]).slice(0, count)).toEqual(Array(count).fill(['example', stage]));
      expect(next[count].kind).not.toBe('example');
    }
  });

  it('practises tasks of the level and form of their stage', () => {
    const engine = new Engine(freshProgress(T0), seeded(7));
    reach(engine, 9);
    for (const t of play(engine, 200)) {
      expect(levelOfProblem(t.problem.total, t.problem.part)).toBe(levelOf(t.stage));
      expect(t.form).toBe(formOf(t.stage));
      if (t.choose) expect(t.form).toBeGreaterThanOrEqual(2);
      if (t.probe) expect(t.form).toBe(3);
    }
  });

  it('mixes in the choice of the inverse from form 2 and the typed check sum in form 3', () => {
    const engine = new Engine(freshProgress(T0), seeded(8));
    reach(engine, 9);
    const tasks = play(engine, 300).filter((t) => t.kind !== 'example');
    expect(tasks.some((t) => t.choose)).toBe(true);
    expect(tasks.some((t) => t.probe)).toBe(true);
    expect(tasks.some((t) => t.form === 3 && !t.probe)).toBe(true);
  });

  it('shows the moved gap once stage 3 is ready and the next form was tried, then mixes it in', () => {
    const engine = new Engine(freshProgress(T0), seeded(9));
    reach(engine, 4);
    expect(engine.progress.backShown).toBe(false);
    let back: Task | undefined;
    for (let i = 0; i < 80 && !back; i++) {
      const before = engine.stageState(BACK_EXAMPLE.stage).attempts;
      const [t] = play(engine, 1);
      if (t.problem.shape === 'back') {
        back = t;
        // Not right after the examples of the new form: first five tasks of practice in it.
        expect(before).toBe(5);
      }
    }
    expect(back).toMatchObject({ kind: 'example', stage: BACK_EXAMPLE.stage, key: problemKey(BACK_EXAMPLE.problem) });
    expect(engine.progress.backShown).toBe(true);
    const later = play(engine, 100).filter((t) => t.kind !== 'example');
    const share = later.filter((t) => t.problem.shape === 'back').length / later.length;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.35);
  });

  it('does not repeat a sum within the last tasks', () => {
    const engine = new Engine(freshProgress(T0), seeded(10));
    const tasks = play(engine, 120).filter((t) => t.kind === 'practice');
    for (let i = 1; i < tasks.length; i++) expect(tasks[i].problem.total).not.toBe(tasks[i - 1].problem.total);
  });

  it('ends a round after eight tasks with a trophy; examples do not count', () => {
    const engine = new Engine(freshProgress(T0), seeded(11));
    let tasks = 0;
    for (let i = 0; i < 40 && engine.progress.trophies === 0; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      const result = engine.answer(t, CLEAN);
      if (t.kind !== 'example') tasks += 1;
      if (result.roundComplete) expect(result.roundComplete).toMatchObject({ tasks: ROUND_TASKS, correct: ROUND_TASKS });
    }
    expect(tasks).toBe(ROUND_TASKS);
    expect(engine.progress.trophies).toBe(1);
    expect(engine.progress.round.tasks).toBe(0);
  });

  it('makes a stage secure only in a later session', () => {
    const engine = new Engine(freshProgress(T0), seeded(12));
    reach(engine, 2);
    for (let i = 0; i < 300 && engine.stageState(1).mastery < SECURE_MASTERY; i++) play(engine, 1);
    expect(engine.stageState(1).mastery).toBeGreaterThanOrEqual(SECURE_MASTERY);
    expect(engine.stageState(1).secure).toBe(false);
    const later = T0 + SESSION_GAP_MS + 1;
    for (let i = 0; i < 200 && !engine.stageState(1).secure; i++) play(engine, 1, undefined, later);
    expect(engine.stageState(1).secure).toBe(true);
  });

  it('starts a new session with a short warm-up from a learnt stage', () => {
    const engine = new Engine(freshProgress(T0), seeded(13));
    reach(engine, 3);
    play(engine, 6);
    const later = T0 + SESSION_GAP_MS + 1;
    const warm = play(engine, WARMUP_TASKS, undefined, later);
    for (const t of warm) expect(engine.stageState(t.stage).ready).toBe(true);
  });

  it('offers a pause after three tasks in a row with mistakes', () => {
    const engine = new Engine(freshProgress(T0), seeded(14));
    play(engine, 2);
    const results = [];
    for (let i = 0; i < 3; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      results.push(engine.answer(t, t.kind === 'example' ? CLEAN : { ...CLEAN, mistake: true }));
    }
    expect(results.at(-1)!.offerPause).toBe(true);
  });

  it('answers each problem with the difference', () => {
    expect(answerOf({ total: 90, part: 23, shape: 'front' })).toBe(67);
  });
});
