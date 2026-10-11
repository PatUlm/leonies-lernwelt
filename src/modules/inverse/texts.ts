import { answerOf, formOf, type Diagnosis, type Problem, type Stage, type Step } from './engine';

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

/** The ones line in words: over the ten it goes to the ten first, then on. */
function onesExplained(start: number, ones: number, result: number): string {
  const startOnes = start % 10;
  if (ones <= startOnes) return `Dann die Einer: ${start} − ${ones} = ${result}.`;
  if (startOnes === 0) return `Dann die Einer: ${start} − ${ones} = ${result}. Dabei gehen wir rückwärts über den Zehner.`;
  return `Dann die Einer: ${start} − ${ones}. Erst ${startOnes} zurück bis ${start - startOnes}, dann noch ${ones - startOnes}: ${result}.`;
}

/** The guided example of a stage, read aloud at once; the numbers to type light up afterwards. */
export function explanation(stage: Stage, p: Problem): string {
  const tens = p.part - (p.part % 10);
  const ones = p.part % 10;
  const between = p.total - tens;
  const answer = answerOf(p);
  const lead = p.shape === 'back'
    ? `Jetzt steht die Lücke nach dem Plus. Die Umkehraufgabe bleibt gleich: ${inverseText(p)}.`
    : 'Gesucht ist die Zahl in der Lücke.';
  switch (formOf(stage)) {
    case 1:
      return `${lead} Wir rechnen rückwärts mit der Umkehraufgabe ${inverseText(p)}. Zuerst die Zehner: ${p.total} − ${tens} = ${between}. ${onesExplained(between, ones, answer)} Tippe die Zahlen ab, die leuchten.`;
    case 2: {
      const inverse = p.shape === 'back' ? '' : ` Die Umkehraufgabe ist ${inverseText(p)}.`;
      return `${lead}${inverse} Jetzt rechnen wir in einer Zeile: ${p.total} − ${tens} − ${ones}. Erst die Zehner weg, das gibt ${between}. Dann die Einer weg, das gibt ${answer}. Tippe die Zahl ab, die leuchtet.`;
    }
    case 3:
      return `${lead} Jetzt rechnen wir die Umkehraufgabe direkt: ${inverseText(p)}. Im Kopf geht es schrittweise: ${p.total} − ${tens} = ${between}, dann ${between} − ${ones} = ${answer}. Tippe die Zahl ab, die leuchtet.`;
  }
}
