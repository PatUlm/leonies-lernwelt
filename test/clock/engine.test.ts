import { describe, expect, it } from 'vitest';
import {
  Engine, HELP_POINTS, SESSION_GAP_MS, TIER_POINTS, freshProgress, isReady, type Task,
} from '../../src/modules/clock/engine';
import { timeKey } from '../../src/modules/clock/time';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;

function wrongIndex(task: Task): number {
  return task.options.findIndex((o) => o.kind !== 'correct');
}

/** Plays `tasks` tasks; a new session starts every `perSession` tasks. */
function play(
  engine: Engine, tasks: number, accuracy: number, rng: () => number,
  perSession = 10, elapsedMs = 10_000, start = T0,
): Task[] {
  const seen: Task[] = [];
  let now = start;
  for (let i = 0; i < tasks; i++) {
    if (i > 0 && i % perSession === 0) now += SESSION_GAP_MS + 1;
    engine.touch(now);
    const task = engine.nextTask();
    seen.push(task);
    const ok = task.kind === 'example' || rng() < accuracy;
    engine.answer(task, ok ? task.correctIndex : wrongIndex(task), false, elapsedMs);
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

  it('unlocks half hours after six correct answers (60 mastery points)', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    play(engine, 2 + 5, 1, seeded(3), 1000, 10_000);
    expect(engine.tierState('digital', 1).mastery).toBe(50);
    expect(engine.tierState('digital', 2).unlocked).toBe(false);
    play(engine, 1, 1, seeded(3), 1000, 10_000);
    expect(engine.tierState('digital', 2).unlocked).toBe(true);
  });

  it('unlocks faster with fluent answers', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    play(engine, 2 + 4, 1, seeded(3), 1000, 2_000);
    expect(engine.tierState('digital', 1).mastery).toBe(60);
    expect(engine.tierState('digital', 2).unlocked).toBe(true);
  });

  it('loses mastery points on mistakes, never below zero', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    play(engine, 2 + 3, 1, seeded(3), 1000, 10_000);
    play(engine, 5, 0, seeded(3), 1000, 10_000);
    expect(engine.tierState('digital', 1).mastery).toBe(0);
  });

  it('introduces a new tier with two examples and then focuses on it', () => {
    const engine = new Engine(freshProgress(T0), seeded(4));
    play(engine, 2 + 6, 1, seeded(5), 1000, 10_000);
    const next = [engine.nextTask()];
    engine.answer(next[0], next[0].correctIndex, false);
    next.push(engine.nextTask());
    engine.answer(next[1], next[1].correctIndex, false);
    expect(next.map((t) => [t.kind, t.tier])).toEqual([['example', 2], ['example', 2]]);

    // Before tier 3 arrives, most clock tasks are half hours.
    const practice = play(engine, 12, 1, seeded(6), 1000, 10_000).filter(
      (t) => t.kind === 'practice' && t.track === 'digital',
    );
    const newest = practice.filter((t) => t.tier === 2).length;
    expect(newest).toBeGreaterThanOrEqual(practice.length * 0.4);
  });

  it('starts a new session with a short warm-up on earlier tiers', () => {
    const engine = new Engine(freshProgress(T0), seeded(14));
    play(engine, 60, 1, seeded(15), 1000, 10_000);
    const unlocked = engine.unlockedTiers('digital');
    expect(unlocked.length).toBeGreaterThan(2);
    const next = play(engine, 3, 1, seeded(16), 1000, 10_000, T0 + 100 * SESSION_GAP_MS);
    const newest = unlocked[unlocked.length - 1];
    expect(next.every((t) => t.warmup && t.tier < newest)).toBe(true);
    expect(engine.progress.warmup).toBe(0);
  });

  it('never repeats a time within four tasks', () => {
    const engine = new Engine(freshProgress(T0), seeded(7));
    const tasks = play(engine, 1500, 0.9, seeded(8));
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

  it('ends the warm-up also when answers are found with help', () => {
    const engine = new Engine(freshProgress(T0), seeded(14));
    play(engine, 60, 1, seeded(15), 1000, 10_000);
    engine.touch(T0 + 100 * SESSION_GAP_MS);
    expect(engine.progress.warmup).toBe(3);
    for (let i = 0; i < 3; i++) {
      const t = engine.nextTask();
      expect(t.warmup).toBe(true);
      engine.answer(t, t.correctIndex, true);
    }
    expect(engine.progress.warmup).toBe(0);
  });

  it('unlocks text within a single session once the clock tier is mastered', () => {
    const engine = new Engine(freshProgress(T0), seeded(11));
    play(engine, 120, 1, seeded(12), 100000, 3_000);
    expect(engine.unlockedTiers('text').length).toBeGreaterThanOrEqual(2);
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

  it('gives only help points and no mastery credit when help was used', () => {
    const engine = new Engine(freshProgress(T0), seeded(19));
    play(engine, 2, 1, seeded(20));
    const t = engine.nextTask();
    const r = engine.answer(t, t.correctIndex, true);
    expect(r.scored).toBe(false);
    expect(engine.progress.points).toBe(HELP_POINTS[1]);
    expect(engine.tierState('digital', 1).attempts).toBe(0);
  });

  it('awards a star for every fifth independent correct answer', () => {
    const engine = new Engine(freshProgress(T0), seeded(21));
    play(engine, 2 + 5, 1, seeded(22));
    expect(engine.stars).toBe(1);
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

describe('persistence of queued tasks', () => {
  it('keeps an unanswered example and review when the app is left', () => {
    const progress = freshProgress(T0);
    const first = new Engine(progress, seeded(40));
    first.nextTask(); // example shown, never answered
    const reloaded = new Engine(JSON.parse(JSON.stringify(progress)), seeded(41));
    expect(reloaded.nextTask().kind).toBe('example');
    expect(reloaded.progress.forced).toHaveLength(2);
  });

  it('removes a review only once it is answered', () => {
    const engine = new Engine(freshProgress(T0), seeded(42));
    play(engine, 2, 1, seeded(43));
    const wrong = engine.nextTask();
    engine.answer(wrong, wrongIndex(wrong), false);
    let review: Task | undefined;
    for (let i = 0; i < 10 && !review; i++) {
      const t = engine.nextTask();
      if (t.kind === 'review') review = t;
      else engine.answer(t, t.correctIndex, false);
    }
    expect(review).toBeDefined();
    expect(engine.progress.reviewQueue).toHaveLength(1);
    engine.answer(review!, review!.correctIndex, false);
    expect(engine.progress.reviewQueue).toHaveLength(0);
  });
});

describe('isReady', () => {
  const base = { unlocked: true, attempts: 12, mastery: 60, ready: false, secure: false };

  it('requires enough mastery points', () => {
    const window = Array.from({ length: 6 }, (_, i) => ({ ok: true, hour: 1 + i, minute: 0 }));
    expect(isReady(1, { ...base, mastery: 50, window })).toBe(false);
    expect(isReady(1, { ...base, window })).toBe(true);
  });

  it('requires both quarter minutes in the window for tier 3', () => {
    const onlyQuarterPast = Array.from({ length: 8 }, (_, i) => ({ ok: true, hour: 1 + i, minute: 15 }));
    expect(isReady(3, { ...base, window: onlyQuarterPast })).toBe(false);
    const mixed = onlyQuarterPast.map((a, i) => ({ ...a, minute: i % 2 ? 45 : 15 }));
    expect(isReady(3, { ...base, window: mixed })).toBe(true);
  });

  it('requires correct answers on at least three different hours', () => {
    const sameHours = Array.from({ length: 8 }, (_, i) => ({ ok: true, hour: 1 + (i % 2), minute: 0 }));
    expect(isReady(1, { ...base, window: sameHours })).toBe(false);
  });
});

describe('rounds', () => {
  it('ends a round when the point target is reached and awards a trophy', () => {
    const engine = new Engine(freshProgress(T0), seeded(30));
    expect(engine.progress.round.target).toBe(100);
    let r = null;
    for (let i = 0; i < 40 && !r; i++) {
      const t = engine.nextTask();
      r = engine.answer(t, t.correctIndex, false).roundComplete;
    }
    expect(r?.target).toBe(100);
    expect(r?.points).toBeGreaterThanOrEqual(100);
    expect(engine.progress.trophies).toBe(1);
    expect(engine.progress.round.points).toBe(0);
  });

  it('scores by tier, gives half points with help and nothing for mistakes', () => {
    const engine = new Engine(freshProgress(T0), seeded(32));
    play(engine, 2, 1, seeded(33));
    const a = engine.nextTask();
    expect(engine.answer(a, wrongIndex(a), false).points).toBe(0);
    const b = engine.nextTask();
    expect(engine.answer(b, b.correctIndex, true).points).toBe(HELP_POINTS[b.tier]);
    const c = engine.nextTask();
    expect(engine.answer(c, c.correctIndex, false).points).toBe(TIER_POINTS[c.tier]);
    expect(engine.progress.round).toMatchObject({ correct: 1, tasks: 3 });
  });

  it('raises the target with harder task mixes', () => {
    const engine = new Engine(freshProgress(T0), seeded(38));
    play(engine, 300, 1, seeded(39));
    expect(engine.roundTarget()).toBeGreaterThan(150);
  });

  it('still reaches the trophy for a player who struggles', () => {
    const engine = new Engine(freshProgress(T0), seeded(36));
    play(engine, 120, 0.5, seeded(37));
    expect(engine.progress.trophies).toBeGreaterThanOrEqual(2);
  });

  it('praises every third independent correct answer in a row', () => {
    const engine = new Engine(freshProgress(T0), seeded(34));
    play(engine, 2, 1, seeded(35));
    const streaks = [];
    for (let i = 0; i < 6; i++) {
      const t = engine.nextTask();
      streaks.push(engine.answer(t, t.correctIndex, false).streak);
    }
    expect(streaks).toEqual([null, null, 3, null, null, 6]);
  });
});
