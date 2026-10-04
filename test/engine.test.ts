import { describe, expect, it } from 'vitest';
import { Engine, SESSION_GAP_MS, freshProgress, isReady, type Task } from '../src/engine';
import { timeKey } from '../src/time';
import { seeded } from './rng';

const T0 = 1_700_000_000_000;

function wrongIndex(task: Task): number {
  return task.options.findIndex((o) => o.kind !== 'correct');
}

/** Plays `tasks` tasks; a new session starts every `perSession` tasks. */
function play(engine: Engine, tasks: number, accuracy: number, rng: () => number, perSession = 10): Task[] {
  const seen: Task[] = [];
  let now = T0;
  for (let i = 0; i < tasks; i++) {
    if (i > 0 && i % perSession === 0) now += SESSION_GAP_MS + 1;
    engine.touch(now);
    const task = engine.nextTask();
    seen.push(task);
    const ok = task.kind === 'example' || rng() < accuracy;
    engine.answer(task, ok ? task.correctIndex : wrongIndex(task), false);
  }
  return seen;
}

describe('Engine', () => {
  it('starts with two guided examples of full hours', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    const first = engine.nextTask();
    engine.answer(first, first.correctIndex, false);
    const second = engine.nextTask();
    expect([first.kind, second.kind]).toEqual(['example', 'example']);
    expect(first.tier).toBe(1);
    expect(first.explanation).toBeTruthy();
  });

  it('does not score guided examples', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    const task = engine.nextTask();
    const result = engine.answer(task, task.correctIndex, false);
    expect(result.scored).toBe(false);
    expect(engine.progress.points).toBe(0);
  });

  it('unlocks half hours after full hours are mastered, but not earlier than 12 attempts', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    play(engine, 2 + 11, 1, seeded(3));
    expect(engine.tierState('digital', 2).unlocked).toBe(false);
    play(engine, 1, 1, seeded(3));
    expect(engine.tierState('digital', 2).unlocked).toBe(true);
  });

  it('introduces a new tier with two examples and then only a small share', () => {
    const engine = new Engine(freshProgress(T0), seeded(4));
    play(engine, 14, 1, seeded(5), 1000);
    const next = [engine.nextTask()];
    engine.answer(next[0], next[0].correctIndex, false);
    next.push(engine.nextTask());
    engine.answer(next[1], next[1].correctIndex, false);
    expect(next.map((t) => [t.kind, t.tier])).toEqual([['example', 2], ['example', 2]]);

    const practice = play(engine, 20, 1, seeded(6), 1000).filter((t) => t.kind === 'practice');
    const newest = practice.filter((t) => t.tier === 2).length;
    expect(newest).toBeLessThan(practice.length / 2);
  });

  it('never repeats a time within four tasks', () => {
    const engine = new Engine(freshProgress(T0), seeded(7));
    const tasks = play(engine, 1500, 0.9, seeded(8)).filter((t) => t.kind !== 'example');
    for (let i = 1; i < tasks.length; i++) {
      const window = tasks.slice(Math.max(0, i - 4), i).map((t) => timeKey(t.time));
      expect(window).not.toContain(timeKey(tasks[i].time));
    }
  });

  it('brings a perfect player through all clock tiers and into text over several sessions', () => {
    const engine = new Engine(freshProgress(T0), seeded(9));
    play(engine, 1500, 1, seeded(10));
    expect(engine.unlockedTiers('digital')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(engine.unlockedTiers('text').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps text locked within a single session (secure needs a later session)', () => {
    const engine = new Engine(freshProgress(T0), seeded(11));
    play(engine, 200, 1, seeded(12), 100000);
    expect(engine.unlockedTiers('text')).toEqual([]);
  });

  it('does not unlock anything for a player who always fails', () => {
    const engine = new Engine(freshProgress(T0), seeded(13));
    play(engine, 200, 0, seeded(14));
    expect(engine.unlockedTiers('digital')).toEqual([1]);
    expect(engine.progress.points).toBe(0);
  });

  it('follows two wrong answers with an example and an easy task', () => {
    const engine = new Engine(freshProgress(T0), seeded(15));
    play(engine, 2, 1, seeded(16));
    for (let i = 0; i < 2; i++) {
      const t = engine.nextTask();
      engine.answer(t, wrongIndex(t), false);
    }
    const a = engine.nextTask();
    engine.answer(a, a.correctIndex, false);
    const b = engine.nextTask();
    expect([a.kind, b.kind]).toEqual(['example', 'easy']);
  });

  it('offers a pause after three independent mistakes in a row', () => {
    const engine = new Engine(freshProgress(T0), seeded(17));
    play(engine, 2, 1, seeded(18));
    const results = [];
    for (let i = 0; i < 4; i++) {
      const t = engine.nextTask();
      results.push(engine.answer(t, t.kind === 'example' ? t.correctIndex : wrongIndex(t), false));
    }
    expect(results.some((r) => r.offerPause)).toBe(true);
  });

  it('gives no points and no mastery credit when help was used', () => {
    const engine = new Engine(freshProgress(T0), seeded(19));
    play(engine, 2, 1, seeded(20));
    const t = engine.nextTask();
    const r = engine.answer(t, t.correctIndex, true);
    expect(r.scored).toBe(false);
    expect(engine.progress.points).toBe(0);
    expect(engine.tierState('digital', 1).attempts).toBe(0);
  });

  it('awards a star for every fifth independent correct answer', () => {
    const engine = new Engine(freshProgress(T0), seeded(21));
    play(engine, 2 + 5, 1, seeded(22));
    expect(engine.stars).toBe(1);
    expect(engine.progress.points).toBe(50);
  });

  it('brings a wrong answer back as review after a few tasks', () => {
    const engine = new Engine(freshProgress(T0), seeded(23));
    play(engine, 2, 1, seeded(24));
    const wrong = engine.nextTask();
    engine.answer(wrong, wrongIndex(wrong), false);
    const later = play(engine, 8, 1, seeded(25), 1000);
    expect(later.some((t) => t.kind === 'review' && timeKey(t.time) === timeKey(wrong.time))).toBe(true);
  });
});

describe('isReady', () => {
  const base = {
    unlocked: true, attempts: 12, block: [], step: 3, ready: false,
    readySession: null, secure: false, review: [],
  };

  it('requires both quarter minutes in the window for tier 3', () => {
    const onlyQuarterPast = Array.from({ length: 8 }, (_, i) => ({ ok: true, hour: 1 + i, minute: 15 }));
    expect(isReady(3, { ...base, window: onlyQuarterPast })).toBe(false);
    const mixed = onlyQuarterPast.map((a, i) => ({ ...a, minute: i % 2 ? 45 : 15 }));
    expect(isReady(3, { ...base, window: mixed })).toBe(true);
  });

  it('requires at least four different hours', () => {
    const sameHours = Array.from({ length: 8 }, (_, i) => ({ ok: true, hour: 1 + (i % 3), minute: 0 }));
    expect(isReady(1, { ...base, window: sameHours })).toBe(false);
  });
});
