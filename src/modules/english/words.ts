/**
 * Word material for "Farben, Zahlen, Tiere": first English words as in the
 * Bavarian year-3 curriculum. Every word has a picture (a colour patch, a
 * digit or an animal), so the task can be heard or read without German.
 */

export type Category = 'colour' | 'number' | 'animal';

export interface Word {
  /** English, lower case as in the school book; also the key of the word. */
  en: string;
  /** German meaning for the confirmation ("red heißt rot."). */
  de: string;
  category: Category;
  /** colour: the patch colour. */
  color?: string;
  /** number: the digit shown. */
  value?: number;
  /** animal: the picture (whole animals where an emoji exists). */
  emoji?: string;
}

const colour = (en: string, de: string, color: string): Word => ({ en, de, category: 'colour', color });
const number = (en: string, de: string, value: number): Word => ({ en, de, category: 'number', value });
const animal = (en: string, de: string, emoji: string): Word => ({ en, de, category: 'animal', emoji });

export const WORDS: readonly Word[] = [
  colour('red', 'rot', '#ef4444'),
  colour('blue', 'blau', '#3b82f6'),
  colour('yellow', 'gelb', '#facc15'),
  colour('green', 'grün', '#22c55e'),
  colour('black', 'schwarz', '#1f2937'),
  colour('white', 'weiß', '#ffffff'),
  colour('orange', 'orange', '#f97316'),
  colour('purple', 'lila', '#a855f7'),
  colour('pink', 'rosa', '#f9a8d4'),
  colour('brown', 'braun', '#92400e'),
  colour('grey', 'grau', '#9ca3af'),
  number('one', 'eins', 1),
  number('two', 'zwei', 2),
  number('three', 'drei', 3),
  number('four', 'vier', 4),
  number('five', 'fünf', 5),
  number('six', 'sechs', 6),
  number('seven', 'sieben', 7),
  number('eight', 'acht', 8),
  number('nine', 'neun', 9),
  number('ten', 'zehn', 10),
  number('eleven', 'elf', 11),
  number('twelve', 'zwölf', 12),
  number('thirteen', 'dreizehn', 13),
  number('fourteen', 'vierzehn', 14),
  number('fifteen', 'fünfzehn', 15),
  number('sixteen', 'sechzehn', 16),
  number('seventeen', 'siebzehn', 17),
  number('eighteen', 'achtzehn', 18),
  number('nineteen', 'neunzehn', 19),
  number('twenty', 'zwanzig', 20),
  animal('cat', 'Katze', '🐈'),
  animal('dog', 'Hund', '🐕'),
  animal('fish', 'Fisch', '🐟'),
  animal('bird', 'Vogel', '🐦'),
  animal('rabbit', 'Kaninchen', '🐇'),
  animal('hamster', 'Hamster', '🐹'),
  animal('lion', 'Löwe', '🦁'),
  animal('elephant', 'Elefant', '🐘'),
  animal('monkey', 'Affe', '🐒'),
  animal('giraffe', 'Giraffe', '🦒'),
  animal('tiger', 'Tiger', '🐅'),
  animal('zebra', 'Zebra', '🦓'),
];

/**
 * The words of each stage in the order they are introduced: the easy, clearly
 * different ones first, two or three at a time.
 */
export const STAGE_WORDS: readonly (readonly string[])[] = [
  ['red', 'blue', 'yellow', 'green', 'black', 'white'],
  ['one', 'two', 'three', 'four', 'five'],
  ['cat', 'dog', 'fish', 'bird', 'rabbit', 'hamster'],
  ['six', 'seven', 'eight', 'nine', 'ten'],
  ['lion', 'elephant', 'monkey', 'giraffe', 'tiger', 'zebra'],
  ['orange', 'purple', 'eleven', 'pink', 'twelve', 'brown', 'grey'],
  ['thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'],
];

export function wordByEn(en: string): Word | undefined {
  return WORDS.find((w) => w.en === en);
}

/** six/sixteen, three/thirteen: they sound alike and only meet once both are familiar. */
export function confusable(a: Word, b: Word): boolean {
  return a.value !== undefined && b.value !== undefined && Math.abs(a.value - b.value) === 10;
}
