import { describe, expect, it } from 'vitest';
import { buildOptions } from '../src/distractors';
import { TIER_MINUTES, TIERS, tierOf, timeKey } from '../src/time';
import { seeded } from './rng';

describe('buildOptions', () => {
  const rng = seeded(42);

  it('always yields three distinct options with exactly one correct, never above the task tier', () => {
    for (const tier of TIERS) {
      for (const advanced of [false, true]) {
        for (let i = 0; i < 300; i++) {
          const correct = { hour: 1 + Math.floor(rng() * 12), minute: TIER_MINUTES[tier][i % TIER_MINUTES[tier].length] };
          const options = buildOptions(correct, { tier, advanced }, rng);
          expect(options).toHaveLength(3);
          expect(new Set(options.map((o) => timeKey(o.time))).size).toBe(3);
          expect(options.filter((o) => o.kind === 'correct')).toHaveLength(1);
          for (const o of options) {
            expect(o.time.hour).toBeGreaterThanOrEqual(1);
            expect(o.time.hour).toBeLessThanOrEqual(12);
            expect(tierOf(o.time.minute)).toBeLessThanOrEqual(tier);
          }
        }
      }
    }
  });

  it('keeps the minute of the correct answer in at least one distractor', () => {
    for (let i = 0; i < 200; i++) {
      const correct = { hour: 3, minute: 45 };
      const options = buildOptions(correct, { tier: 3, advanced: false }, rng);
      expect(options.filter((o) => o.time.minute === 45).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('uses the next hour as hour error after the half hour', () => {
    const options = buildOptions({ hour: 3, minute: 45 }, { tier: 3, advanced: false }, rng);
    expect(options.find((o) => o.kind === 'hour')?.time).toEqual({ hour: 4, minute: 45 });
  });

  it('spreads the correct answer over all positions', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 900; i++) {
      const options = buildOptions({ hour: 5, minute: 30 }, { tier: 2, advanced: true }, rng);
      counts[options.findIndex((o) => o.kind === 'correct')]++;
    }
    for (const c of counts) expect(c).toBeGreaterThan(220);
  });
});
