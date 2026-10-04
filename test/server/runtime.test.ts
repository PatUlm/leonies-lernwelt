import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('server runtime', () => {
  it('loads with plain Node type stripping, as in the container', () => {
    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "await import('./server/src/app.ts'); await import('./server/src/store.ts'); console.log('ok')"],
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('ok');
  });
});
