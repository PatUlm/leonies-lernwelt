import type { SpeechPart } from '../../shared/speech';
import { answerText, questionText } from './content';
import type { Diagnosis, Problem, Stage } from './engine';

/**
 * Everything the child reads or hears in "How many?". Instructions are
 * German; English sentences are parts of their own, spoken from their
 * recordings by an English voice. Every German part is a fixed sentence and
 * recorded beforehand (scripts/german-texts.ts).
 */
export type Text = SpeechPart[];

const DE_NUMBERS = ['ein', 'zwei', 'drei', 'vier', 'fünf'];

/** "ein Geist", "drei Geister" */
function germanCount(p: Problem): string {
  return p.count === 1 ? p.noun.deOne : `${DE_NUMBERS[p.count - 1]} ${p.noun.deMany}`;
}

export function question(p: Problem): Text {
  return [{ en: questionText(p.noun) }];
}

export function answer(p: Problem): Text {
  return [{ en: answerText(p.count, p.noun) }];
}

/** Under the picture while she builds the answer. */
export const BUILD_PROMPT = 'Bau die Antwort mit den Kärtchen.';
/** Help when every card is already right. */
export const COMPLETE_HELP = 'Der Satz stimmt. Tippe auf „Prüfen“.';
export const TAP_MARKED = 'Tippe die Kärtchen an, die leuchten.';
/** A wrong card in an example, once the right one lights up. */
export const MARKED_CARD = 'Das leuchtende Kärtchen ist dran.';

/**
 * The guided example of a stage, read aloud at once; the cards light up one
 * after the other afterwards. The same examples come back after a sentence
 * had to be shown, so they never say "neu" (the toast does).
 */
export function explanation(stage: Stage, p: Problem): Text {
  const one = p.count === 1;
  const lead = {
    1: `${one ? 'Hier ist nur' : 'Hier sind'} ${germanCount(p)}. Dann sagt man:`,
    2: `Bei einem heißt es „is“, bei mehreren „are“. Hier sind ${germanCount(p)}. Dann sagt man:`,
    3: `Eine Zahl passt nicht: Zähle genau. Hier sind ${germanCount(p)}. Dann sagt man:`,
  }[stage];
  const rule = stage === 1 ? [one ? 'Bei einem bleibt das s weg.' : 'Bei mehreren kommt ein s dazu.'] : [];
  return [lead, ...answer(p), ...rule, TAP_MARKED];
}

/** After a first wrong check: what it most likely means, without giving the card away. */
export const HINTS: Record<Diagnosis, string> = {
  plural: 'Eins oder mehrere? Bei einem bleibt das s weg, bei mehreren kommt ein s dazu.',
  verb: 'Eins oder mehrere? Bei einem heißt es „is“, bei mehreren „are“.',
  count: 'Zähle noch einmal genau.',
  order: 'Achte auf die Reihenfolge: zuerst „There“, dann „is“ oder „are“, dann die Zahl und zum Schluss das Wort zum Bild.',
};

/** Help for the first place still open; the right card lights up with it. */
export function help(slot: number, p: Problem): string {
  const one = p.count === 1;
  switch (slot) {
    case 0:
      return 'Der Satz fängt mit „There“ an.';
    case 1:
      return one ? 'Es ist nur eins: Dann heißt es „is“.' : 'Es sind mehrere: Dann heißt es „are“.';
    case 2:
      return 'Zähle mit: Die richtige Zahl leuchtet.';
    default:
      return one ? 'Es ist nur eins: Dann bleibt das s weg.' : 'Es sind mehrere: Dann kommt ein s dazu.';
  }
}

/** After the second wrong check the sentence is shown. */
export function reveal(p: Problem): Text {
  return ['Schauen wir zusammen:', ...answer(p)];
}

/** "Richtig! There are two ghosts." */
export function confirmation(lead: string, p: Problem): Text {
  return [lead, ...answer(p)];
}

/** Plain text of a message: the parts with a space between them. */
export function plain(text: Text): string {
  return text.map((p) => (typeof p === 'string' ? p : p.en)).join(' ');
}
