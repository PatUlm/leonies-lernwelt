import { describe, expect, it } from 'vitest';
import { handAngles } from '../../src/modules/clock/clock';
import { TIER_MINUTES, TIERS, addMinutes, formatDigital, tierOf, wrapHour } from '../../src/modules/clock/time';

describe('tiers', () => {
  it('assigns every minute to exactly one tier', () => {
    const all = TIERS.flatMap((t) => TIER_MINUTES[t]).sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 60 }, (_, i) => i));
  });

  it.each([[0, 1], [30, 2], [15, 3], [45, 3], [50, 4], [20, 4], [55, 5], [5, 5], [1, 6], [59, 6]])(
    'minute %i is tier %i',
    (minute, tier) => expect(tierOf(minute)).toBe(tier),
  );
});

describe('clock arithmetic', () => {
  it('wraps hours into 1–12', () => {
    expect(wrapHour(0)).toBe(12);
    expect(wrapHour(13)).toBe(1);
    expect(wrapHour(-1)).toBe(11);
  });

  it('adds minutes across hours', () => {
    expect(addMinutes({ hour: 12, minute: 55 }, 10)).toEqual({ hour: 1, minute: 5 });
    expect(addMinutes({ hour: 1, minute: 5 }, -10)).toEqual({ hour: 12, minute: 55 });
  });

  it('formats 12-hour digital time', () => {
    expect(formatDigital({ hour: 3, minute: 5 })).toBe('3:05');
    expect(formatDigital({ hour: 12, minute: 0 })).toBe('12:00');
  });
});

describe('hand angles', () => {
  it('moves the hour hand continuously', () => {
    expect(handAngles({ hour: 3, minute: 0 })).toEqual({ hour: 90, minute: 0 });
    expect(handAngles({ hour: 3, minute: 30 })).toEqual({ hour: 105, minute: 180 });
    expect(handAngles({ hour: 12, minute: 45 }).hour).toBeCloseTo(22.5);
  });
});
