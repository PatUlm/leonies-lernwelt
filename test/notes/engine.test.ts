import { describe, expect, it } from 'vitest';
import { EIGHTHS, ROW_EIGHTHS, filledRow, lengthOf, onBeat, parseRow, rowCodes } from '../../src/modules/notes/content';
import {
  EXAMPLES, Engine, HELP_POINTS, INTRO_MASTERY, MIN_DISTINCT, OPTIONS, POINTS, READY_MASTERY, ROUND_TASKS, SECURE_MASTERY, SESSION_GAP_MS,
  STAGES, STEP_MASTERY, freshProgress, validKey,
  type Stage, type Task,
} from '../../src/modules/notes/engine';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;

/** Answers `n` tasks (examples always right), right unless `wrong` says otherwise. */
function play(engine: Engine, n: number, wrong: (t: Task) => boolean = () => false, now = T0, helped = false): Task[] {
  const tasks: Task[] = [];
  for (let i = 0; i < n; i++) {
    engine.touch(now);
    const t = engine.nextTask();
    tasks.push(t);
    const bad = t.kind !== 'example' && wrong(t);
    engine.answer(t, bad ? (t.correctIndex + 1) % t.options.length : t.correctIndex, helped && t.kind !== 'example');
  }
  return tasks;
}

/** Plays rightly until `stage` is unlocked. */
function reach(engine: Engine, stage: Stage, now = T0): Task[] {
  const tasks: Task[] = [];
  for (let i = 0; i < 500 && !engine.stageState(stage).unlocked; i++) tasks.push(...play(engine, 1, undefined, now));
  expect(engine.stageState(stage).unlocked).toBe(true);
  return tasks;
}

describe('note values', () => {
  it('counts in eighths: a beat is two', () => {
    expect(EIGHTHS).toEqual({ e: 1, q: 2, h: 4 });
    expect(lengthOf(['e', 'e', 'q'])).toBe(4);
  });

  it('writes eighths in pairs on the beat, as on her sheet', () => {
    expect(onBeat(['e', 'e', 'q'])).toBe(true);
    expect(onBeat(['q', 'e', 'e'])).toBe(true);
    for (const notes of [['e'], ['e', 'q', 'e'], ['q', 'e']] as const) expect(onBeat(notes)).toBe(false);
  });

  it('builds every row of two beats with one gap', () => {
    expect(rowCodes().sort()).toEqual([
      '_', '_ee', '_eee', '_eq', '_q', 'e_ee', 'e_q', 'ee_', 'ee_e', 'eee_', 'q_', 'q_e', 'qe_',
    ]);
    for (const code of rowCodes()) expect(lengthOf(parseRow(code)!.notes)).toBe(ROW_EIGHTHS);
  });

  it('reads a row with its gap: the missing note is what is left of two beats', () => {
    expect(parseRow('q_')).toEqual({ notes: ['q', 'q'], gap: 1 });
    expect(parseRow('e_q')).toEqual({ notes: ['e', 'e', 'q'], gap: 1 });
    expect(parseRow('_')).toEqual({ notes: ['h'], gap: 0 });
    for (const code of ['q', '__', 'h_', '_e', 'qq_', 'eq_', 'x_']) expect(parseRow(code)).toBeNull();
    expect(filledRow(parseRow('q_e')!, 'e')).toEqual(['q', 'e', 'e']);
  });

  it('accepts only keys that make a task of their stage', () => {
    expect([validKey(1, 'q'), validKey(2, 'h'), validKey(1, 'w'), validKey(3, 'qe_'), validKey(3, 'q'), validKey(1, 'q_')])
      .toEqual([true, true, false, true, false, false]);
  });
});

describe('notes engine', () => {
  it('starts with the quarter and the eighth as guided examples that earn nothing', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    const [first, second] = play(engine, 2);
    expect([first.kind, second.kind]).toEqual(['example', 'example']);
    expect([first.key, second.key]).toEqual(['q', 'e']);
    expect(engine.progress.round.tasks).toBe(0);
    expect(engine.progress.points).toBe(0);
  });

  it('asks only explained notes: the half note after its own example', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    const before: Task[] = [];
    while (engine.stageState(1).mastery < STEP_MASTERY) before.push(...play(engine, 1));
    for (const t of before) {
      expect(t.value).not.toBe('h');
      expect(t.options).not.toContain('h');
    }
    expect(before.filter((t) => t.kind !== 'example').every((t) => t.options.length === 2)).toBe(true);
    const [example, ...after] = play(engine, 40);
    expect(example).toMatchObject({ kind: 'example', stage: 1, key: 'h' });
    expect(after.some((t) => t.value === 'h')).toBe(true);
    expect(after.every((t) => t.options.length === OPTIONS)).toBe(true);
  });

  it('brings the empty two beats in stage 3 only after their example', () => {
    const engine = new Engine(freshProgress(T0), seeded(3));
    reach(engine, 3);
    const before: Task[] = [];
    while (engine.stageState(3).mastery < STEP_MASTERY) before.push(...play(engine, 1));
    expect(before.filter((t) => t.stage === 3 && t.key === '_' && t.kind !== 'example')).toEqual([]);
    const after = play(engine, 80);
    const firstEmpty = after.findIndex((t) => t.stage === 3 && t.key === '_');
    expect(after[firstEmpty]).toMatchObject({ kind: 'example', stage: 3 });
    expect(after.slice(firstEmpty + 1).some((t) => t.key === '_' && t.kind !== 'example')).toBe(true);
  });

  it('gives points and mastery only for an independent right answer', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    play(engine, 3);
    expect(engine.progress.points).toBe(POINTS);
    play(engine, 1, () => false, T0, true);
    expect(engine.progress.points).toBe(POINTS + HELP_POINTS);
    expect(engine.stageState(1).attempts).toBe(1);
    play(engine, 1, () => true);
    expect(engine.progress.points).toBe(POINTS + HELP_POINTS);
    expect(engine.stageState(1).window.map((a) => a.ok)).toEqual([true, false]);
  });

  it('offers different answers with the right one in every stage', () => {
    const engine = new Engine(freshProgress(T0), seeded(4));
    const tasks: Task[] = [];
    for (const stage of STAGES.slice(1)) {
      reach(engine, stage);
      tasks.push(...play(engine, 60));
    }
    for (const t of tasks) {
      expect(t.options).toHaveLength(OPTIONS);
      expect(new Set(t.options).size).toBe(OPTIONS);
      expect(t.options[t.correctIndex]).toBe(t.value);
      if (t.stage === 3) {
        expect(lengthOf(t.row!.notes)).toBe(ROW_EIGHTHS);
        expect(t.row!.notes[t.row!.gap]).toBe(t.value);
      }
    }
    const positions = new Set(tasks.filter((t) => t.stage === 1).map((t) => t.correctIndex));
    expect(positions.size).toBe(OPTIONS);
  });

  it('starts stage 3 with the last note missing, later anywhere, and every note is missing now and then', () => {
    const engine = new Engine(freshProgress(T0), seeded(5));
    reach(engine, 3);
    const early: Task[] = [];
    for (let i = 0; i < 30; i++) {
      const intro = engine.stageState(3).mastery < INTRO_MASTERY;
      const [t] = play(engine, 1);
      if (intro && t.stage === 3 && t.kind === 'practice') early.push(t);
    }
    expect(early.length).toBeGreaterThan(0);
    for (const t of early) expect(t.row!.gap).toBe(t.row!.notes.length - 1);
    const later = play(engine, 200).filter((t) => t.stage === 3 && t.kind === 'practice');
    expect(later.some((t) => t.row!.gap < t.row!.notes.length - 1)).toBe(true);
    expect(new Set(later.map((t) => t.value))).toEqual(new Set(['e', 'q', 'h']));
  });

  it('unlocks the stages one by one, each only when every note was right, with its examples first', () => {
    const engine = new Engine(freshProgress(T0), seeded(6));
    for (const stage of STAGES.slice(1)) {
      reach(engine, stage);
      const prev = engine.stageState((stage - 1) as Stage);
      expect(prev.ready).toBe(true);
      expect(prev.mastery).toBeGreaterThanOrEqual(READY_MASTERY);
      const right = new Set(prev.window.filter((a) => a.ok).map((a) => a.value));
      expect(right.size).toBeGreaterThanOrEqual(MIN_DISTINCT[(stage - 1) as Stage]);
      const first = EXAMPLES[stage][0];
      const next = play(engine, first.length + 1);
      expect(next.slice(0, first.length).map((t) => [t.kind, t.stage, t.key])).toEqual(first.map((key) => ['example', stage, key]));
      expect(next[first.length].kind).not.toBe('example');
    }
  });

  it('brings a wrong answer back a few tasks later, after two in a row an example', () => {
    const engine = new Engine(freshProgress(T0), seeded(7));
    play(engine, 2);
    const [wrong] = play(engine, 1, () => true);
    const later = play(engine, 8);
    expect(later.some((t) => t.kind === 'review' && t.key === wrong.key)).toBe(true);

    const again = new Engine(freshProgress(T0), seeded(8));
    play(again, 2);
    play(again, 2, () => true);
    const [example] = play(again, 1);
    expect(example).toMatchObject({ kind: 'example', stage: 1 });
    expect(['q', 'e']).toContain(example.key);
  });

  it('never repeats a task straight away, also with only two notes open', () => {
    for (const seed of [1, 2, 3]) {
      const start = new Engine(freshProgress(T0), seeded(seed));
      const tasks: Task[] = [];
      while (start.stageState(1).steps < 2) tasks.push(...play(start, 1));
      for (let i = 1; i < tasks.length; i++) expect(tasks[i].key).not.toBe(tasks[i - 1].key);
    }
    const engine = new Engine(freshProgress(T0), seeded(9));
    reach(engine, 3);
    const tasks = play(engine, 200).filter((t) => t.kind === 'practice');
    for (let i = 1; i < tasks.length; i++) {
      if (tasks[i].stage === tasks[i - 1].stage) expect(tasks[i].key).not.toBe(tasks[i - 1].key);
    }
  });

  it('ends a round after ten tasks with a trophy; examples do not count', () => {
    const engine = new Engine(freshProgress(T0), seeded(10));
    let tasks = 0;
    for (let i = 0; i < 40 && engine.progress.trophies === 0; i++) {
      tasks += play(engine, 1).filter((t) => t.kind !== 'example').length;
    }
    expect(tasks).toBe(ROUND_TASKS);
    expect(engine.progress.round.tasks).toBe(0);
  });

  it('makes a stage secure only in a later session', () => {
    const engine = new Engine(freshProgress(T0), seeded(11));
    reach(engine, 2);
    for (let i = 0; i < 300 && engine.stageState(1).mastery < SECURE_MASTERY; i++) play(engine, 1);
    expect(engine.stageState(1).secure).toBe(false);
    const later = T0 + SESSION_GAP_MS + 1;
    for (let i = 0; i < 200 && !engine.stageState(1).secure; i++) play(engine, 1, undefined, later);
    expect(engine.stageState(1).secure).toBe(true);
  });

  it('offers a pause after three wrong answers in a row (the example after two does not count)', () => {
    const engine = new Engine(freshProgress(T0), seeded(12));
    play(engine, 2);
    const results = [0, 1, 2, 3].map(() => {
      engine.touch(T0);
      const t = engine.nextTask();
      const example = t.kind === 'example';
      return [example, engine.answer(t, example ? t.correctIndex : (t.correctIndex + 1) % t.options.length, false).offerPause];
    });
    expect(results).toEqual([[false, false], [false, false], [true, false], [false, true]]);
  });
});
