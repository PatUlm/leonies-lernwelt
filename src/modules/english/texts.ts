import type { SpeechPart } from '../../shared/speech';
import type { Task } from './engine';
import type { Category, Word } from './words';

/**
 * Everything the child reads or hears in "Farben, Zahlen, Tiere". Instructions
 * are German; English words are separate parts, so they are spoken by an
 * English voice and shown apart from the German text.
 */
export type Text = SpeechPart[];

const WHAT: Record<Category, string> = {
  colour: 'Welche Farbe ist das?',
  number: 'Welche Zahl ist das?',
  animal: 'Welches Tier ist das?',
};

export function question(task: Task): Text {
  const q = {
    listen: `Hör gut zu: ${WHAT[task.word.category]}`,
    read: `Lies das Wort: ${WHAT[task.word.category]}`,
    word: 'Wie heißt das auf Englisch?',
  }[task.variant];
  return [task.familiar ? `Das kannst du schon! ${q}` : q];
}

/** "red heißt rot." */
export function meaning(word: Word): Text {
  return [{ en: word.en }, ` heißt ${word.de}.`];
}

/** Guided example: the word with its meaning, then which button to tap. */
export function example(task: Task): Text {
  return [task.isNew ? 'Neues Wort: ' : 'Schau mal: ', ...meaning(task.word), ' Die richtige Antwort wird gleich hervorgehoben – tippe sie an.'];
}

/** After "Schauen wir zusammen.": the right word, heard once more when listening. */
export function mistake(task: Task): Text {
  return [...meaning(task.word), ...(task.variant === 'listen' ? [' Hör es dir noch einmal an.'] : [])];
}

/** Plain text of a message, e.g. for the message line. */
export function plain(text: Text): string {
  return text.map((p) => (typeof p === 'string' ? p : p.en)).join('');
}

/**
 * The message for a German voice when the device has no English one: a German
 * voice is no model for English, so the English word is left out.
 */
export function withoutEnglish(text: Text): string {
  return text.map((p) => (typeof p === 'string' ? p : 'Das englische Wort')).join('');
}
