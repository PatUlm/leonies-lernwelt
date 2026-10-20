import type { SpeechPart } from '../../shared/speech';
import { questionText, sentenceText } from './content';
import { sentenceOf, type Diagnosis, type Problem, type Role, type Stage } from './engine';

/**
 * Everything the child reads or hears in "How many?". Instructions are
 * German; English words and sentences are parts of their own, spoken from
 * their recordings by an English voice. Every German part is a fixed sentence
 * and recorded beforehand (scripts/german-texts.ts).
 */
export type Text = SpeechPart[];

const DE_NUMBERS = ['ein', 'zwei', 'drei', 'vier', 'fünf'];

/** "ein Geist", "drei Geister" */
function germanCount(p: Problem): string {
  return p.count === 1 ? p.noun.deOne : `${DE_NUMBERS[p.count - 1]} ${p.noun.deMany}`;
}

/** Stage 3 only: stages 1 and 2 ask in German, the English would give the answer away. */
export function question(p: Problem): Text {
  return [{ en: questionText(p.noun) }];
}

/** The word (stage 1) or the sentence of a task, as she hears it once it is solved. */
export function answer(stage: Stage, p: Problem): Text {
  const words = sentenceOf(stage, p);
  return [{ en: stage === 1 ? words[0] : sentenceText(words) }];
}

/** Stages 1 and 2: one card to choose. */
export const CHOOSE_PROMPT = 'Welches Wort passt?';
/** Stage 3, under the picture while she builds the answer. */
export const BUILD_PROMPT = 'Bau die Antwort mit den Kärtchen.';
/** Help when every card is already right. */
export const COMPLETE_HELP = 'Der Satz stimmt. Tippe auf „Prüfen“.';
export const TAP_MARKED_ONE = 'Tippe das Kärtchen an, das leuchtet.';
export const TAP_MARKED = 'Tippe die Kärtchen an, die leuchten.';
/** A wrong card in an example, once the right one lights up. */
export const MARKED_CARD = 'Das leuchtende Kärtchen ist dran.';
/** Shown once after the stages were rebuilt (a toast, not read aloud). */
export const NEWS = 'Neue Übungen! Sterne und Pokale bleiben.';

/**
 * The guided example of a stage, read aloud at once; the cards light up
 * afterwards. The same examples come back after a mistake, so they never
 * say "neu" (the toast does).
 */
export function explanation(stage: Stage, p: Problem): Text {
  const one = p.count === 1;
  const here = `${one ? 'Hier ist nur' : 'Hier sind'} ${germanCount(p)}.`;
  switch (stage) {
    case 1:
      return [`${here} Auf Englisch heißt das:`, ...answer(1, p), one ? 'Bei einem bleibt das s weg.' : 'Bei mehreren kommt ein s dazu.', TAP_MARKED_ONE];
    case 2:
      return [`${here} ${one ? 'Bei einem heißt es „is“:' : 'Bei mehreren heißt es „are“:'}`, ...answer(2, p), TAP_MARKED_ONE];
    case 3:
      return one
        ? [`Im ganzen Satz sagen wir auch, wie viele es sind. Hier ist genau ${germanCount(p)}:`, ...answer(3, p), 'Mit „one“ sagen wir: genau eins.', TAP_MARKED]
        : [`${here} Zähle genau, eine Zahl passt nicht:`, ...answer(3, p), TAP_MARKED];
  }
}

/** Stage 3, after a first wrong check: what it most likely means, without giving the card away. */
export const HINTS: Record<Diagnosis, string> = {
  plural: 'Eins oder mehrere? Bei einem bleibt das s weg, bei mehreren kommt ein s dazu.',
  verb: 'Eins oder mehrere? Bei einem heißt es „is“, bei mehreren „are“.',
  count: 'Zähle noch einmal genau.',
  order: 'Achte auf die Reihenfolge: zuerst „There“, dann „is“ oder „are“, dann die Zahl und zum Schluss das Wort zum Bild.',
};

/** Help for the first place still open; the right card lights up with it. */
export function help(role: Role, one: boolean): string {
  switch (role) {
    case 'there':
      return 'Der Satz fängt mit „There“ an.';
    case 'verb':
      return one ? 'Es ist nur eins: Dann heißt es „is“.' : 'Es sind mehrere: Dann heißt es „are“.';
    case 'number':
      return 'Zähle mit: Die richtige Zahl leuchtet.';
    case 'noun':
      return one ? 'Es ist nur eins: Dann bleibt das s weg.' : 'Es sind mehrere: Dann kommt ein s dazu.';
  }
}

/** Stages 1 and 2, after a wrong card: the rule, then the right word or sentence. */
export function mistake(stage: Stage, p: Problem): Text {
  const one = p.count === 1;
  const look = one ? 'Schau genau: Es ist nur eins.' : 'Schau genau: Es sind mehrere.';
  const rule = stage === 1
    ? (one ? 'Bei einem bleibt das s weg.' : 'Bei mehreren kommt ein s dazu.')
    : (one ? 'Bei einem heißt es „is“.' : 'Bei mehreren heißt es „are“.');
  return [`${look} ${rule}`, ...answer(stage, p)];
}

/** Stage 3, after the second wrong check the sentence is shown. */
export function reveal(p: Problem): Text {
  return ['Schauen wir zusammen:', ...answer(3, p)];
}

/** "Richtig! There are two ghosts." */
export function confirmation(lead: string, stage: Stage, p: Problem): Text {
  return [lead, ...answer(stage, p)];
}

/** Plain text of a message: the parts with a space between them. */
export function plain(text: Text): string {
  return text.map((p) => (typeof p === 'string' ? p : p.en)).join(' ');
}
