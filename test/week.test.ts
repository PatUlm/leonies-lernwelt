import { describe, expect, it } from 'vitest';
import { weekKey } from '../src/shared/week';

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
