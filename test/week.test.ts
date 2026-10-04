import { describe, expect, it } from 'vitest';
import { Engine, freshProgress } from '../src/modules/clock/engine';
import { sanitizeProgress } from '../src/modules/clock/storage';
import { weekKey } from '../src/shared/week';
import { answerTask } from './clock/answer';
import { seeded } from './rng';

/** Local time, so the test does not depend on the time zone. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('weekKey', () => {
  it('names a week by its Monday, from Monday 0:00 to Sunday 24:00', () => {
    expect(weekKey(at(2026, 9, 28, 0))).toBe('2026-09-28');
    expect(weekKey(at(2026, 10, 4, 23))).toBe('2026-09-28');
    expect(weekKey(at(2026, 10, 5, 0))).toBe('2026-10-05');
  });

  it('crosses month and year ends', () => {
    expect(weekKey(at(2027, 1, 1))).toBe('2026-12-28');
  });
});

describe('week points', () => {
  function playCorrect(engine: Engine, now: number, tasks: number): number {
    let points = 0;
    for (let i = 0; i < tasks; i++) {
      engine.touch(now);
      points += answerTask(engine, engine.nextTask(), true).points;
    }
    return points;
  }

  it('adds every awarded point to the current week and starts over on Monday', () => {
    const sunday = at(2026, 10, 4);
    const engine = new Engine(freshProgress(sunday), seeded(3));
    const points = playCorrect(engine, sunday, 8);
    expect(points).toBeGreaterThan(0);
    expect(engine.weekPoints(sunday)).toBe(points);

    const monday = at(2026, 10, 5);
    expect(engine.weekPoints(monday)).toBe(0);
    const more = playCorrect(engine, monday, 3);
    expect(engine.weekPoints(monday)).toBe(more);
    expect(engine.progress.points).toBe(points + more);
  });

  it('keeps the week from saved progress and replaces an invalid one', () => {
    const now = at(2026, 10, 4);
    const p = freshProgress(now);
    p.week = { key: '2026-09-28', points: 42 };
    expect(sanitizeProgress(JSON.parse(JSON.stringify(p)), now).week).toEqual({ key: '2026-09-28', points: 42 });
    const broken = { ...JSON.parse(JSON.stringify(p)), week: { key: 'soon', points: 5 } };
    expect(sanitizeProgress(broken, now).week).toEqual({ key: '2026-09-28', points: 0 });
  });
});
