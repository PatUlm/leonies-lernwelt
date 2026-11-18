import { describe, expect, it } from 'vitest';
import { leavesCourse } from '../../src/modules/leaves/course';
import { forestRulesCourse } from '../../src/modules/forestrules/course';
import { treeCourse } from '../../src/modules/tree/course';
import type { QuizCourse } from '../../src/shared/quiz/course';
import {
  Engine, HELP_POINTS, OPTIONS, POINTS, READY_MASTERY, ROUND_TASKS, SECURE_MASTERY, SESSION_GAP_MS, STEP_MASTERY,
  exampleKeys, freshProgress, stageNumbers,
  type Task,
} from '../../src/shared/quiz/engine';
import { sanitizeProgress } from '../../src/shared/quiz/storage';
import { statsFromProgress } from '../../src/shared/quiz/stats';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;
const COURSES: [string, QuizCourse][] = [['Der Baum', treeCourse], ['Laubbäume', leavesCourse], ['Waldregeln', forestRulesCourse]];

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
function reach(engine: Engine, stage: number, now = T0): Task[] {
  const tasks: Task[] = [];
  for (let i = 0; i < 800 && !engine.stageState(stage).unlocked; i++) tasks.push(...play(engine, 1, undefined, now));
  expect(engine.stageState(stage).unlocked).toBe(true);
  return tasks;
}

/** Plays every stage open, then a while longer: tasks of the whole course. */
function playAll(course: QuizCourse, seed: number, wrong: (t: Task) => boolean = () => false): Task[] {
  const engine = new Engine(course, freshProgress(course, T0), seeded(seed));
  const tasks: Task[] = [];
  for (const stage of stageNumbers(course).slice(1)) {
    for (let i = 0; i < 800 && !engine.stageState(stage).unlocked; i++) tasks.push(...play(engine, 1, wrong));
  }
  tasks.push(...play(engine, 200, wrong));
  return tasks;
}

describe.each(COURSES)('quiz course %s', (_name, course) => {
  const stages = stageNumbers(course);

  it('has every key of a stage in exactly one step, each with an answer', () => {
    for (const stage of stages) {
      const keys = exampleKeys(course, stage);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) expect(course.answer(stage, key)).toBeTruthy();
      expect(course.stages[stage - 1].minDistinct).toBeLessThanOrEqual(keys.length);
    }
  });

  it('starts with the examples of the first step in order; they earn nothing', () => {
    const engine = new Engine(course, freshProgress(course, T0), seeded(1));
    const first = course.stages[0].steps[0];
    const tasks = play(engine, first.length);
    expect(tasks.map((t) => [t.kind, t.key])).toEqual(first.map((key) => ['example', key]));
    expect(engine.progress.points).toBe(0);
    expect(engine.progress.round.tasks).toBe(0);
  });

  it('asks a key and offers an answer card only after its example', () => {
    for (const seed of [2, 3, 4]) {
      const shown = new Map<number, Set<string>>(stages.map((s) => [s, new Set()]));
      for (const t of playAll(course, seed, (task) => task.id % 4 === 0)) {
        const explained = shown.get(t.stage)!;
        // Every card was the right answer of an example of this stage before, or is the one explained now.
        const cards = new Set([...explained].map((k) => course.answer(t.stage, k)));
        if (t.kind === 'example') cards.add(course.answer(t.stage, t.key));
        else expect(explained.has(t.key)).toBe(true);
        for (const option of t.options) expect(cards.has(option)).toBe(true);
        explained.add(t.key);
      }
    }
  });

  it('offers different answers with the right one, three where the stage has them, in every position', () => {
    const tasks = playAll(course, 5);
    const answersOf = (stage: number) => new Set(exampleKeys(course, stage).map((k) => course.answer(stage, k))).size;
    for (const t of tasks) {
      expect(new Set(t.options).size).toBe(t.options.length);
      expect(t.options[t.correctIndex]).toBe(course.answer(t.stage, t.key));
      if (t.kind !== 'example') expect(t.options).toHaveLength(Math.min(OPTIONS, answersOf(t.stage)));
      const order = course.order?.(t.stage);
      if (order) expect([...t.options].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(t.options);
    }
    for (const stage of stages) {
      expect(new Set(tasks.filter((t) => t.stage === stage).map((t) => t.correctIndex)).size).toBe(Math.min(OPTIONS, answersOf(stage)));
    }
  });

  it('always offers an explained partner next to the right answer', () => {
    const shown = new Map<number, Set<string>>(stages.map((s) => [s, new Set()]));
    let checked = 0;
    for (const t of playAll(course, 6)) {
      const cards = new Set([...shown.get(t.stage)!].map((k) => course.answer(t.stage, k)));
      if (t.kind === 'example') shown.get(t.stage)!.add(t.key);
      const partners = (course.partners?.(t.stage, t.key) ?? []).filter((p) => cards.has(p));
      if (!partners.length) continue;
      checked += 1;
      expect(partners.some((p) => t.options.includes(p))).toBe(true);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('brings the next step after enough learning points, and unlocks a stage only with all steps shown', () => {
    const engine = new Engine(course, freshProgress(course, T0), seeded(7));
    while (engine.stageState(1).mastery < STEP_MASTERY) play(engine, 1);
    expect(engine.stageState(1).steps).toBe(2);
    const step = course.stages[0].steps[1];
    expect(play(engine, step.length).map((t) => [t.kind, t.key])).toEqual(step.map((key) => ['example', key]));
    if (stages.length > 1) {
      reach(engine, 2);
      const first = engine.stageState(1);
      expect(first.ready).toBe(true);
      expect(first.steps).toBe(course.stages[0].steps.length);
      expect(first.mastery).toBeGreaterThanOrEqual(READY_MASTERY);
      const next = course.stages[1].steps[0];
      expect(play(engine, next.length).map((t) => [t.kind, t.stage, t.key])).toEqual(next.map((key) => ['example', 2, key]));
    }
  });

  it('gives points and mastery only for an independent right answer', () => {
    const engine = new Engine(course, freshProgress(course, T0), seeded(8));
    play(engine, course.stages[0].steps[0].length);
    play(engine, 1);
    expect(engine.progress.points).toBe(POINTS);
    play(engine, 1, () => false, T0, true);
    expect(engine.progress.points).toBe(POINTS + HELP_POINTS);
    expect(engine.stageState(1).attempts).toBe(1);
    play(engine, 1, () => true);
    expect(engine.progress.points).toBe(POINTS + HELP_POINTS);
    expect(engine.stageState(1).window.map((a) => a.ok)).toEqual([true, false]);
  });

  it('brings a wrong answer back a few tasks later', () => {
    const engine = new Engine(course, freshProgress(course, T0), seeded(9));
    play(engine, course.stages[0].steps[0].length);
    const [wrong] = play(engine, 1, () => true);
    expect(play(engine, 8).some((t) => t.kind === 'review' && t.key === wrong.key)).toBe(true);
  });

  it('never repeats a task straight away', () => {
    const tasks = playAll(course, 10);
    for (let i = 1; i < tasks.length; i++) {
      const [a, b] = [tasks[i - 1], tasks[i]];
      if (a.kind !== 'example' && b.kind !== 'example' && a.stage === b.stage) expect(b.key).not.toBe(a.key);
    }
  });

  it('ends a round after ten tasks with a trophy; examples do not count', () => {
    const engine = new Engine(course, freshProgress(course, T0), seeded(11));
    let tasks = 0;
    for (let i = 0; i < 60 && engine.progress.trophies === 0; i++) tasks += play(engine, 1).filter((t) => t.kind !== 'example').length;
    expect(tasks).toBe(ROUND_TASKS);
  });

  it('makes a stage secure only in a later session', () => {
    const engine = new Engine(course, freshProgress(course, T0), seeded(12));
    for (let i = 0; i < 400 && engine.stageState(1).mastery < SECURE_MASTERY; i++) play(engine, 1);
    expect(engine.stageState(1).ready).toBe(true);
    expect(engine.stageState(1).secure).toBe(false);
    const later = T0 + SESSION_GAP_MS + 1;
    for (let i = 0; i < 400 && !engine.stageState(1).secure; i++) play(engine, 1, undefined, later);
    expect(engine.stageState(1).secure).toBe(true);
    expect(statsFromProgress(course, engine.progress, later).badges).toContain(course.stages[0].badge);
  });

  it('keeps a stored progress and drops what is unknown', () => {
    const engine = new Engine(course, freshProgress(course, T0), seeded(13));
    play(engine, 30, (t) => t.id % 3 === 0);
    const stored = JSON.parse(JSON.stringify(engine.progress));
    expect(sanitizeProgress(course, stored, T0)).toEqual(engine.progress);
    stored.reviewQueue.push({ stage: 1, key: 'tanne', dueAt: 0 }, { stage: 9, key: exampleKeys(course, 1)[0], dueAt: 0 });
    stored.recent.push('1:tanne');
    stored.stages[0].window.push({ ok: true, key: 'tanne' });
    const clean = sanitizeProgress(course, stored, T0);
    expect(clean.reviewQueue).toEqual(engine.progress.reviewQueue);
    expect(clean.recent.every((r) => !r.includes('tanne'))).toBe(true);
    expect(clean.stages[0].window.every((a) => a.key !== 'tanne')).toBe(true);
    expect(sanitizeProgress(course, { version: 7 }, T0)).toEqual(freshProgress(course, T0));
    expect(sanitizeProgress(course, null, T0).stages[0].unlocked).toBe(true);
  });

  it('suggests discovering the module first, then continuing the round', () => {
    const engine = new Engine(course, freshProgress(course, T0), seeded(14));
    expect(statsFromProgress(course, engine.progress, T0).suggestion.label).toBe(`${course.object} entdecken`);
    play(engine, course.stages[0].steps[0].length + 1);
    const stats = statsFromProgress(course, engine.progress, T0);
    expect(stats.suggestion.label).toBe('Durchgang fortsetzen');
    expect(stats.goals).toMatchObject({ done: 0, total: stages.length });
  });
});

describe('Der Baum', () => {
  it('never offers the other task of the same part in stage 3', () => {
    for (const t of playAll(treeCourse, 20).filter((task) => task.stage === 3)) {
      const part = treeCourse.answer(2, t.key);
      expect(t.options.filter((o) => treeCourse.answer(2, o) === part)).toEqual([t.key]);
    }
  });

  it('puts "der Stamm" next to "die Rinde" once both are explained', () => {
    const tasks = playAll(treeCourse, 21).filter((t) => t.stage === 1 && t.kind !== 'example' && t.key === 'rinde');
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) expect(t.options).toContain('stamm');
  });
});

describe('Waldregeln', () => {
  it('starts "richtig oder falsch" with a right statement alone, then a wrong one, "Richtig" always left', () => {
    const engine = new Engine(forestRulesCourse, freshProgress(forestRulesCourse, T0), seeded(30));
    reach(engine, 2);
    const [first, second, ...rest] = play(engine, 12).filter((t) => t.stage === 2);
    expect([first.kind, first.key, first.options]).toEqual(['example', 'weg', ['richtig']]);
    expect([second.kind, second.key, second.options]).toEqual(['example', 'schreien', ['richtig', 'falsch']]);
    for (const t of rest) expect(t.options).toEqual(['richtig', 'falsch']);
  });
});
