import { describe, expect, it } from 'vitest';
import { BAR_EIGHTHS, EIGHTHS, groupsOf, lengthOf, onBeat, parseBar, parseNotes } from '../../src/modules/notes/content';
import {
  EXAMPLES, Engine, HELP_POINTS, INTRO_MASTERY, MIN_DISTINCT, OPTIONS, POINTS, READY_MASTERY, ROUND_TASKS, SECURE_MASTERY, SESSION_GAP_MS,
  STAGES, filledBar, freshProgress, parseGroupKey, validKey,
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
function reach(engine: Engine, stage: Stage, now = T0): void {
  for (let i = 0; i < 500 && !engine.stageState(stage).unlocked; i++) play(engine, 1, undefined, now);
  expect(engine.stageState(stage).unlocked).toBe(true);
}

describe('note values', () => {
  it('counts in eighths: a beat is two', () => {
    expect(EIGHTHS).toEqual({ e: 1, q: 2, h: 4, w: 8 });
    expect(lengthOf(['e', 'e', 'q'])).toBe(4);
  });

  it('writes eighths in pairs on the beat, as on her sheet', () => {
    expect(onBeat(['e', 'e', 'q'])).toBe(true);
    expect(onBeat(['q', 'e', 'e'])).toBe(true);
    for (const code of ['e', 'eqe', 'qe', 'eeeq']) expect(parseNotes(code)).toBeNull();
    expect(parseNotes('eeqx')).toBeNull();
  });

  it('builds the groups of her sheet for two beats, and only groups of two or more notes', () => {
    expect(groupsOf(2).map((g) => g.join('')).sort()).toEqual(['eeee', 'eeq', 'qee', 'qq']);
    expect(groupsOf(1).map((g) => g.join(''))).toEqual(['ee']);
    for (const beats of [1, 2, 3, 4, 5]) {
      for (const g of groupsOf(beats)) {
        expect(lengthOf(g)).toBe(beats * 2);
        expect(g.length).toBeGreaterThanOrEqual(2);
        expect(g.length).toBeLessThanOrEqual(4);
        expect(g).not.toContain('w');
      }
    }
  });

  it('reads a bar with its gap: the missing note is what is left of four beats', () => {
    expect(parseBar('hq_')).toEqual({ notes: ['h', 'q', 'q'], gap: 2 });
    expect(parseBar('_qq')?.notes).toEqual(['h', 'q', 'q']);
    for (const code of ['hq', 'h__', 'w_', 'eq_', 'hqq_', 'e_eq', '_ee']) expect(parseBar(code)).toBeNull();
    expect(filledBar(parseBar('q_q')!, 'e')).toEqual(['q', 'e', 'q']);
  });

  it('accepts only keys that make a task of their stage', () => {
    expect(parseGroupKey('h:eeq')).toEqual({ target: 'h', group: ['e', 'e', 'q'] });
    for (const key of ['h:q', 'h:qqq', 'e:ee', 'w:w', 'h', 'h:qq:x']) expect(parseGroupKey(key)).toBeNull();
    expect([validKey(1, 'q'), validKey(3, 'w'), validKey(1, 'x'), validKey(4, 'qq_'), validKey(4, 'q')]).toEqual([true, true, false, true, false]);
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

  it('offers three different answers with the right one in every stage', () => {
    const engine = new Engine(freshProgress(T0), seeded(3));
    const tasks: Task[] = [];
    for (const stage of STAGES.slice(1)) {
      reach(engine, stage);
      tasks.push(...play(engine, 60));
    }
    for (const t of tasks) {
      expect(t.options).toHaveLength(OPTIONS);
      expect(new Set(t.options.map((o) => o.join(''))).size).toBe(OPTIONS);
      const right = t.options[t.correctIndex];
      if (t.stage === 2) {
        // Exactly one group as long as the note.
        expect(t.options.filter((o) => lengthOf(o) === EIGHTHS[t.value])).toEqual([right]);
        for (const o of t.options) expect(onBeat(o)).toBe(true);
      } else {
        expect(right).toEqual([t.value]);
      }
      if (t.stage === 4) {
        expect(lengthOf(t.bar!.notes)).toBe(BAR_EIGHTHS);
        expect(['q', 'h']).toContain(t.value);
        expect(t.bar!.notes[t.bar!.gap]).toBe(t.value);
      }
    }
    const positions = new Set(tasks.filter((t) => t.stage === 1).map((t) => t.correctIndex));
    expect(positions.size).toBe(OPTIONS);
  });

  it('starts stages 2 and 4 with the fields, and the bar with its last note missing', () => {
    const engine = new Engine(freshProgress(T0), seeded(4));
    reach(engine, 4);
    const early: Task[] = [];
    for (let i = 0; i < 30; i++) {
      const intro = engine.stageState(4).mastery < INTRO_MASTERY;
      const [t] = play(engine, 1);
      if (intro && t.stage === 4 && t.kind === 'practice') early.push(t);
    }
    expect(early.length).toBeGreaterThan(0);
    for (const t of early) {
      expect(t.fields).toBe(true);
      expect(t.bar!.gap).toBe(t.bar!.notes.length - 1);
    }
    for (let i = 0; i < 200 && engine.stageState(4).mastery < INTRO_MASTERY; i++) play(engine, 1);
    const later = play(engine, 80).filter((t) => t.stage === 4 && t.kind === 'practice');
    expect(later.every((t) => !t.fields)).toBe(true);
    expect(later.some((t) => t.bar!.gap < t.bar!.notes.length - 1)).toBe(true);
    // Stages 1 and 3 show the length on the cards anyway.
    expect(play(engine, 40).filter((t) => t.stage === 1 || t.stage === 3).every((t) => !t.fields)).toBe(true);
  });

  it('asks for the half note most often in stage 2, with every group of her sheet', () => {
    const engine = new Engine(freshProgress(T0), seeded(5));
    reach(engine, 2);
    const tasks = play(engine, 400).filter((t) => t.stage === 2 && t.kind === 'practice');
    const halves = tasks.filter((t) => t.value === 'h');
    expect(halves.length / tasks.length).toBeGreaterThan(0.4);
    expect(new Set(halves.map((t) => t.key))).toEqual(new Set(['h:qq', 'h:eeq', 'h:qee', 'h:eeee']));
  });

  it('unlocks the stages one by one, each only when every value was right, with its examples first', () => {
    const engine = new Engine(freshProgress(T0), seeded(6));
    for (const stage of STAGES.slice(1)) {
      reach(engine, stage);
      const prev = engine.stageState((stage - 1) as Stage);
      expect(prev.ready).toBe(true);
      expect(prev.mastery).toBeGreaterThanOrEqual(READY_MASTERY);
      const right = new Set(prev.window.filter((a) => a.ok).map((a) => a.value));
      expect(right.size).toBeGreaterThanOrEqual(MIN_DISTINCT[(stage - 1) as Stage]);
      const count = EXAMPLES[stage].length;
      const next = play(engine, count + 1);
      expect(next.slice(0, count).map((t) => [t.kind, t.stage, t.key])).toEqual(EXAMPLES[stage].map((key) => ['example', stage, key]));
      expect(next[count].kind).not.toBe('example');
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
  });

  it('never repeats a task straight away', () => {
    const engine = new Engine(freshProgress(T0), seeded(9));
    reach(engine, 4);
    const tasks = play(engine, 200).filter((t) => t.kind === 'practice');
    for (let i = 1; i < tasks.length; i++) {
      if (tasks[i].stage === tasks[i - 1].stage) expect(tasks[i].key).not.toBe(tasks[i - 1].key);
    }
  });

  it('never brings the quarter with its only group (two eighths) twice in a row', () => {
    const progress = freshProgress(T0);
    progress.stages[1].unlocked = true;
    progress.forced = [];
    const engine = new Engine(progress, seeded(13));
    // With help nothing is learnt: stage 2 stays the newest.
    const tasks = play(engine, 600, () => false, T0, true).filter((t) => t.stage === 2);
    expect(tasks.filter((t) => t.key === 'q:ee').length).toBeGreaterThan(20);
    const straight = tasks.filter((t, i) => i > 0 && t.id === tasks[i - 1].id + 1 && t.key === tasks[i - 1].key);
    expect(straight).toEqual([]);
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
      return [t.kind, engine.answer(t, t.kind === 'example' ? t.correctIndex : (t.correctIndex + 1) % OPTIONS, false).offerPause];
    });
    expect(results).toEqual([['practice', false], ['practice', false], ['example', false], ['practice', true]]);
  });
});
