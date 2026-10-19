/**
 * Sentences of "How many?": the question about a picture and its answer, as
 * on Leonie's Halloween worksheet ("How many ghosts are there? There are five
 * ghosts."). No imports: the API loads this file to know which sentences may
 * have a recording (server/src/tts.ts).
 */

export interface Noun {
  /** "ghost"; also the key of the noun. */
  one: string;
  /** "ghosts": only regular plurals, the "s" is the point. */
  many: string;
  /** German for the examples: "ein Geist", "drei Geister". */
  deOne: string;
  deMany: string;
}

export const NOUNS: readonly Noun[] = [
  { one: 'ghost', many: 'ghosts', deOne: 'ein Geist', deMany: 'Geister' },
  { one: 'cat', many: 'cats', deOne: 'eine Katze', deMany: 'Katzen' },
  { one: 'dog', many: 'dogs', deOne: 'ein Hund', deMany: 'Hunde' },
];

/** The numbers as words, from one: NUMBER_WORDS[count - 1]. */
export const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five'] as const;
export const MAX_COUNT = NUMBER_WORDS.length;

export function nounOf(key: string): Noun | undefined {
  return NOUNS.find((n) => n.one === key);
}

/** "How many ghosts are there?" */
export function questionText(noun: Noun): string {
  return `How many ${noun.many} are there?`;
}

/** The answer word by word, lower case: ["there", "is", "one", "ghost"]. */
export function answerWords(count: number, noun: Noun): string[] {
  return ['there', count === 1 ? 'is' : 'are', NUMBER_WORDS[count - 1], count === 1 ? noun.one : noun.many];
}

/** A sentence from its words: capital letter at the start, full stop at the end. */
export function sentenceText(words: readonly string[]): string {
  const text = words.join(' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** "There is one ghost." */
export function answerText(count: number, noun: Noun): string {
  return sentenceText(answerWords(count, noun));
}

/** Every English sentence of the module: the questions and all answers. */
export function englishSentences(): string[] {
  return NOUNS.flatMap((noun) => [
    questionText(noun),
    ...NUMBER_WORDS.map((_, i) => answerText(i + 1, noun)),
  ]);
}

/** File name of a sentence's recording, without extension: "there-are-two-ghosts". */
export function sentenceFile(sentence: string): string {
  return sentence.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
}
