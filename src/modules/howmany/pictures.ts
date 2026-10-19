import type { Problem } from './engine';

const OUTLINE = '#1e3a5f';

/** A friendly ghost like the ones on the worksheet: round head, wavy hem, two eyes. */
export const GHOST = `<svg class="ghost-svg" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M20 90V46a30 30 0 0 1 60 0v44l-10-8-10 8-10-8-10 8-10-8Z" fill="#fff" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>
  <ellipse cx="40" cy="46" rx="5" ry="7" fill="${OUTLINE}"/>
  <ellipse cx="60" cy="46" rx="5" ry="7" fill="${OUTLINE}"/>
  <path d="M43 62q7 6 14 0" fill="none" stroke="${OUTLINE}" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;

const EMOJI: Record<string, string> = { cat: '🐈', dog: '🐕' };

/** Places in a 3 × 3 grid (row, column) as on a die: easy to count at a glance. */
const DIE: Record<number, readonly (readonly [number, number])[]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
};

/** The picture to count; its label is the German answer, which gives no English away. */
export function picture(p: Problem): string {
  const one = EMOJI[p.noun.one] ? `<span class="count-emoji">${EMOJI[p.noun.one]}</span>` : GHOST;
  const things = DIE[p.count].map(([row, col]) => `<span class="count-thing" style="grid-area:${row}/${col}">${one}</span>`);
  return `<div class="count-picture" role="img" aria-label="${p.count} ${p.count === 1 ? p.noun.deOne.split(' ')[1] : p.noun.deMany}">${things.join('')}</div>`;
}
