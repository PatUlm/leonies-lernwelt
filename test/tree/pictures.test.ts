import { describe, expect, it } from 'vitest';
import { PARTS } from '../../src/modules/tree/content';
import { treeSvg } from '../../src/modules/tree/pictures';

/** What the blue outline is drawn around. */
function halo(svg: string): string {
  return svg.split('<g filter="url(#tree-halo)">').slice(1).map((s) => s.split('</g>', 1)[0]).join('|');
}

describe('tree picture', () => {
  it('outlines every part', () => {
    for (const part of PARTS) expect(halo(treeSvg(part)), part).not.toBe('');
  });

  it('outlines the whole trunk for the trunk, only the peeling strip for the bark', () => {
    const trunk = 'M156 192C166 170 168 146 170 118H190';
    expect(halo(treeSvg('stamm'))).toContain(trunk);
    expect(halo(treeSvg('rinde'))).not.toContain(trunk);
  });
});
