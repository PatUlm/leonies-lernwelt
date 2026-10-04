import { describe, expect, it } from 'vitest';
import { Stopwatch } from '../src/shared/stopwatch';

describe('Stopwatch', () => {
  it('counts only time without any pause reason', () => {
    let t = 0;
    const sw = new Stopwatch(() => t);
    sw.restart();
    t = 1000;
    sw.pause('speech');
    t = 5000;
    sw.pause('hidden');
    sw.resume('speech');
    t = 9000; // still hidden
    sw.resume('hidden');
    t = 10_500;
    expect(sw.read()).toBe(2500);
  });

  it('can start paused, e.g. in a hidden tab', () => {
    let t = 0;
    const sw = new Stopwatch(() => t);
    sw.restart(['hidden']);
    t = 4000;
    sw.resume('hidden');
    t = 5000;
    expect(sw.read()).toBe(1000);
  });
});
