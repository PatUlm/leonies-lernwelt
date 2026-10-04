import { describe, expect, it } from 'vitest';
import { FailureLimiter } from '../../server/src/auth.ts';

describe('FailureLimiter', () => {
  it('blocks after max failures inside the window and frees the key afterwards', () => {
    let t = 0;
    const limiter = new FailureLimiter(3, 1000, () => t);
    for (let i = 0; i < 3; i++) limiter.fail('a');
    expect(limiter.retryAfter('a')).toBe(1000);
    t = 1001;
    expect(limiter.retryAfter('a')).toBe(0);
  });

  it('forgets expired keys, so memory does not grow forever', () => {
    let t = 0;
    const limiter = new FailureLimiter(3, 1000, () => t);
    for (let i = 0; i < 900; i++) limiter.fail(`old-${i}`);
    t = 5000;
    for (let i = 0; i < 1200; i++) limiter.fail(`new-${i}`);
    expect(limiter.size).toBeLessThanOrEqual(1200);
  });
});
