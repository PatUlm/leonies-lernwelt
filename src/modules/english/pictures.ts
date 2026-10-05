import type { Word } from './words';

/** Shapes for colour patches: at first a plain circle, for familiar colours any of them. */
export type Shape = 'circle' | 'square' | 'heart' | 'star';
export const SHAPES: readonly Shape[] = ['circle', 'square', 'heart', 'star'];

const OUTLINE = '#1e3a5f';

const SHAPE_MARKUP: Record<Shape, string> = {
  circle: '<circle cx="50" cy="50" r="42"/>',
  square: '<rect x="10" y="10" width="80" height="80" rx="16"/>',
  heart: '<path d="M50 88C20 66 6 50 6 32a22 22 0 0 1 44-10 22 22 0 0 1 44 10c0 18-14 34-44 56Z"/>',
  star: '<path d="M50 5l12.5 30.5 33 2.5-25 21.5 8 32L50 74 21.5 91.5l8-32-25-21.5 33-2.5Z"/>',
};

/** The picture of a word: a colour patch, a digit or an animal. Never its English name. */
export function picture(word: Word, shape: Shape = 'circle'): string {
  switch (word.category) {
    case 'colour':
      return `<svg class="picture swatch" viewBox="0 0 100 100" aria-hidden="true"><g fill="${word.color}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round">${SHAPE_MARKUP[shape]}</g></svg>`;
    case 'number':
      return `<span class="picture digit" aria-hidden="true">${word.value}</span>`;
    case 'animal':
      return `<span class="picture animal" aria-hidden="true">${word.emoji}</span>`;
  }
}
