import type { Tree } from './pictures';

/**
 * "Laubbäume", from Leonie's HSU fact cards on six deciduous trees (Klasse 3):
 *
 *   stage 1: leaf → tree      a heart-shaped leaf: [die Linde] [die Birke] [die Buche]
 *   stage 2: fruit → tree     an acorn in its cup: [die Eiche] [die Kastanie] [der Ahorn]
 *
 * The terms for leaf shape and margin come later (BACKLOG.md).
 */
export const NAMES: Record<Tree, string> = {
  ahorn: 'der Ahorn',
  eiche: 'die Eiche',
  kastanie: 'die Kastanie',
  linde: 'die Linde',
  birke: 'die Birke',
  buche: 'die Buche',
};

/** Stage 1: first the three leaves that cannot be mixed up, then the similar three. */
export const LEAF_STEPS: readonly (readonly Tree[])[] = [['ahorn', 'eiche', 'kastanie'], ['linde', 'birke'], ['buche']];
/** Stage 2: the beech right after the chestnut, both have a prickly husk. */
export const FRUIT_STEPS: readonly (readonly Tree[])[] = [['eiche', 'kastanie', 'ahorn'], ['buche'], ['linde', 'birke']];

/** Leaves easily mixed up: one of them is always offered once explained. */
export const LEAF_PARTNERS: Record<Tree, readonly Tree[]> = {
  ahorn: ['kastanie'],
  kastanie: ['ahorn'],
  eiche: [],
  linde: ['birke', 'buche'],
  birke: ['linde', 'buche'],
  buche: ['linde', 'birke'],
};

/** Fruits easily mixed up: the prickly husks, and the three with wings. */
export const FRUIT_PARTNERS: Record<Tree, readonly Tree[]> = {
  kastanie: ['buche'],
  buche: ['kastanie'],
  eiche: [],
  linde: ['birke', 'ahorn'],
  birke: ['linde', 'ahorn'],
  ahorn: ['linde', 'birke'],
};
