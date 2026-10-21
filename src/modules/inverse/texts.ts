import { answerOf, levelOf, type Diagnosis, type Problem, type Stage, type Step } from './engine';

/**
 * Everything the child reads or hears in "Umkehraufgaben". The fixed sentences
 * (questions, help, hints, the guided examples) are recorded beforehand; a
 * line with the numbers of a practice task is read by the device voice.
 * Minus is the sign "−" (U+2212), read as "minus" (src/shared/spoken.ts).
 */

export const GAP = '__';

/** "90 − 20 − 3" */
export function termsText(step: Step): string {
  return step.terms.join(` ${step.op} `);
}

/** "__ + 23 = 90", or with the gap filled: "67 + 23 = 90". */
export function gapTaskText(p: Problem, filled = false): string {
  const gap = filled ? String(answerOf(p)) : GAP;
  return p.shape === 'front' ? `${gap} + ${p.part} = ${p.total}` : `${p.part} + ${gap} = ${p.total}`;
}

/** "90 − 23" */
export function inverseText(p: Problem): string {
  return `${p.total} − ${p.part}`;
}

/** The two choices for the inverse: the right one first. */
export function inverseOptions(p: Problem): [string, string] {
  return [inverseText(p), `${p.total} + ${p.part}`];
}

export const CHOOSE_QUESTION = 'Welche Umkehraufgabe passt?';
export const CHOOSE_RIGHT = 'Richtig: Aus plus wird minus.';
export const CHOOSE_WRONG = 'Die Umkehraufgabe rechnet rückwärts: Aus plus wird minus.';
export const CHOOSE_HELP = 'Die Umkehraufgabe rechnet rückwärts: Aus plus wird minus. Wir fangen bei der großen Zahl an.';

const QUESTIONS: Record<Step['kind'], string> = {
  tens: 'Ziehe zuerst die Zehner ab.',
  ones: 'Ziehe jetzt die Einer ab.',
  line: 'Rechne schrittweise: erst die Zehner, dann die Einer.',
  direct: 'Rechne die Umkehraufgabe.',
  probe: 'Mach die Probe: Rechne die Plusaufgabe.',
};

export function question(step: Step): string {
  return QUESTIONS[step.kind];
}

/** Does this line go back over a ten? */
export function crossesTen(step: Step): boolean {
  return step.kind !== 'tens' && step.kind !== 'probe' && step.terms[step.terms.length - 1] % 10 > step.terms[0] % 10;
}

/** Help for the open line; in one line or directly, help brings back the two lines (EXPAND_HELP). */
export function help(step: Step): string {
  switch (step.kind) {
    case 'tens':
      return 'Ziehe zuerst nur die Zehner ab. Die Einer kommen in der nächsten Zeile.';
    case 'ones':
      if (!crossesTen(step)) return 'Jetzt fehlen nur noch die Einer. Ziehe sie ab.';
      // 70 − 3: already on the ten, the ones go back below it.
      return step.terms[0] % 10 === 0
        ? 'Jetzt fehlen noch die Einer. Du stehst schon auf einem glatten Zehner: Zähle von dort rückwärts.'
        : 'Jetzt fehlen noch die Einer. Gehe zuerst bis zum Zehner zurück, dann weiter.';
    case 'probe':
      return 'Zähle zusammen: erst die Zehner dazu, dann die Einer.';
    default:
      return EXPAND_HELP;
  }
}

export const EXPAND_HELP = 'Wir rechnen in zwei Zeilen: zuerst die Zehner, dann die Einer.';

/** After a first wrong number: what it most likely means. */
export const HINTS: Record<Diagnosis, string> = {
  order: 'Wir rechnen schrittweise: zuerst nur die Zehner, dann die Einer.',
  added: 'Schau auf das Minuszeichen. Beim Abziehen wird die Zahl kleiner.',
  tensKept: 'Du gehst rückwärts über den Zehner. Dann hast du einen Zehner weniger.',
  toTen: 'Gehe zuerst bis zum Zehner zurück. Ziehe dann den Rest ab.',
  both: 'Ziehe beides ab: die Zehner und die Einer.',
  again: 'Rechne diesen Schritt noch einmal.',
  probe: 'Rechne die Plusaufgabe noch einmal: erst die Zehner dazu, dann die Einer.',
};

/** After the second wrong number the line is shown. */
export function reveal(step: Step): string {
  return `Schauen wir zusammen: ${termsText(step)} = ${step.result}.`;
}

/** In an example she types the number that lights up. */
export const EXAMPLE_TYPE = 'Tippe die Zahl ab, die leuchtet.';

/** The gap task with its answer, said at the end: "67 + 23 = 90." */
export function confirmation(p: Problem): string {
  return `${gapTaskText(p, true)}.`;
}


/** "drei Zehner": how many tens are taken from 100. */
const TENS_WORDS = ['', 'einen', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];

/**
 * A guided example explains line by line: each line gets its own short
 * message, read aloud before its number lights up. A new way of writing says
 * the whole way, new numbers in a known way only what is new. The same
 * examples come back after a mistake, so they never say "neu" (the toast does).
 */
function exampleLine(stage: Stage, p: Problem, step: Step): string {
  const tens = p.part - (p.part % 10);
  const ones = p.part % 10;
  const between = p.total - tens;
  const answer = answerOf(p);
  const back = between % 10;
  const level = levelOf(stage);
  // Over the ten: back to the ten first, then on.
  const way = level === 3
    ? `erst ${tens} zurück bis ${between}, dann ${back} bis ${between - back} und noch ${ones - back}: ${answer}`
    : `erst ${tens} zurück bis ${between}, dann ${ones} zurück bis ${answer}`;
  switch (step.kind) {
    case 'tens':
      if (p.total === 100) return `100 sind zehn Zehner. Wir nehmen ${TENS_WORDS[tens / 10]} Zehner weg: 100 − ${tens} = ${between}.`;
      if (level === 2) return `Hier starten wir bei einem glatten Zehner: ${p.total} − ${tens} = ${between}.`;
      if (level === 3) return `Hier reichen die Einer nicht. Zuerst die Zehner: ${p.total} − ${tens} = ${between}.`;
      return `Die Umkehraufgabe rechnet rückwärts: ${inverseText(p)}. Zuerst die Zehner: ${p.total} − ${tens} = ${between}.`;
    case 'ones':
      if (p.total === 100) return `Jetzt noch ${ones} zurück: ${between} − ${ones} = ${answer}.`;
      if (level === 2) return `Von ${between} gehen wir ${ones} zurück, unter den Zehner: ${between} − ${ones} = ${answer}.`;
      if (level === 3) return `Für ${between} − ${ones} gehen wir erst ${back} zurück bis ${between - back}, dann noch ${ones - back}: ${answer}.`;
      return `Dann die Einer: ${between} − ${ones} = ${answer}.`;
    case 'line':
      if (p.shape === 'back') return `Jetzt steht die Lücke nach dem Plus. Die Umkehraufgabe bleibt gleich: ${termsText(step)}.`;
      return `Jetzt in einer Zeile: ${termsText(step)}. ${way.charAt(0).toUpperCase()}${way.slice(1)}.`;
    case 'direct':
      return `Jetzt direkt${level === 2 ? ' vom glatten Zehner' : ''}: ${inverseText(p)}. Im Kopf ${way}.`;
    case 'probe':
      return `Mit der Probe prüfen wir die gefundene Zahl. ${termsText(step)} ergibt wieder ${p.total}.`;
  }
}

/** The example message of one line: what to calculate, then the number to type. */
export function exampleText(stage: Stage, p: Problem, step: Step): string {
  return `${exampleLine(stage, p, step)} ${EXAMPLE_TYPE}`;
}

/** The example of choosing the inverse: why it is the minus task; then its button lights up. */
export function chooseExample(p: Problem): string {
  return `Wir suchen die fehlende Zahl zur Plusaufgabe. Dafür rechnen wir rückwärts: ${inverseText(p)}. Tippe auf die Aufgabe, die leuchtet.`;
}
