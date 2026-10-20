import { ANSWER_FOLLOWS } from '../../shared/game/texts';
import { BAR_EIGHTHS, EIGHTHS, lengthOf, type Target, type Value } from './content';
import type { Stage, Task } from './engine';

/**
 * Everything the child reads or hears in "Notenwerte". A message is a list
 * of fixed sentences, each recorded on its own (scripts/german-texts.ts).
 * The length is always said in beats: the names "kurz, mittel, lang" from
 * school are not clear yet, rhythm syllables are not taught.
 */
export type Text = string[];

/** How long a note lasts. */
export const RULES: Record<Value, string> = {
  e: 'Die Achtelnote dauert einen halben Schlag.',
  q: 'Die Viertelnote dauert einen Schlag.',
  h: 'Die halbe Note dauert zwei Schläge.',
  w: 'Die ganze Note dauert vier Schläge.',
};

/** How to tell a note by its look. */
export const LOOKS: Record<Value, string> = {
  e: 'Ausgemalt, mit Hals und Fähnchen: Das ist eine Achtelnote.',
  q: 'Ausgemalt, mit Hals, ohne Fähnchen: Das ist eine Viertelnote.',
  h: 'Innen leer, mit Hals: Das ist eine halbe Note.',
  w: 'Innen leer, ohne Hals: Das ist eine ganze Note.',
};

export const QUESTIONS: Record<Stage, string> = {
  1: 'Wie lange dauert diese Note?',
  2: 'Welche Noten dauern zusammen genauso lang?',
  3: 'Welche Note dauert so lange?',
  4: 'Welche Note fehlt im Takt?',
};

export const LOOK_TOGETHER = 'Schauen wir zusammen.';
export const BAR_RULE = 'In einen Takt passen vier Schläge.';
export const BAR_FULL = 'Jetzt ist der Takt voll.';
export const GROUP_HELP = 'Zähle bei jeder Gruppe die Schläge zusammen. Die Felder helfen dir.';
export const BAR_HELP = 'Zähle, wie viele Schläge schon da sind. Die Felder helfen dir.';

/** Stage 4: what the gap needs. */
export const MISSING: Record<'q' | 'h', string> = {
  q: 'Es fehlt ein Schlag: die Viertelnote.',
  h: 'Es fehlen zwei Schläge: die halbe Note.',
};

/** Stage 2: the group matches the note. */
export const SAME_AS: Record<Target, string> = {
  q: 'Zusammen dauern sie einen Schlag, genau wie die Viertelnote.',
  h: 'Zusammen dauern sie zwei Schläge, genau wie die halbe Note.',
  w: 'Zusammen dauern sie vier Schläge, genau wie die ganze Note.',
};

/** Lengths in eighths as said in a sentence: "zweieinhalb". */
const BEAT_WORDS: Record<number, string> = {
  2: 'einen', 4: 'zwei', 5: 'zweieinhalb', 6: 'drei', 7: 'dreieinhalb', 8: 'vier', 10: 'fünf', 12: 'sechs', 14: 'sieben',
};

function beats(eighths: number): string {
  return `${BEAT_WORDS[eighths]} ${eighths === 2 ? 'Schlag' : 'Schläge'}`;
}

/** Stage 2, a wrong group: how long it lasts. */
export function groupLength(eighths: number): string {
  return `Diese Noten dauern zusammen ${beats(eighths)}.`;
}

/** Stage 4, a wrong note: too short or too long for the bar. */
export function barLength(eighths: number): string {
  return eighths < BAR_EIGHTHS ? `Das sind erst ${beats(eighths)}.` : `Das wären ${beats(eighths)}.`;
}

/** The guided examples (EXAMPLES in the engine), read aloud at once; the answer lights up afterwards. */
const EXAMPLE_TEXTS: Record<Stage, Record<string, Text>> = {
  1: {
    q: [LOOKS.q, RULES.q, 'Ein Feld ist ein Schlag.', ANSWER_FOLLOWS],
    e: [LOOKS.e, 'Zwei Achtel passen in einen Schlag.', RULES.e, ANSWER_FOLLOWS],
  },
  2: {
    'h:qq': [RULES.h, 'Genauso lang heißt: zusammen gleich viele Schläge.', 'Zwei Viertelnoten dauern auch zwei Schläge.', ANSWER_FOLLOWS],
    'h:eeq': [RULES.h, 'Zwei Achtel dauern zusammen einen Schlag. Mit der Viertelnote sind es zwei.', ANSWER_FOLLOWS],
  },
  3: {
    h: ['Gesucht ist eine Note, die zwei Schläge dauert.', LOOKS.h, ANSWER_FOLLOWS],
    e: ['Gesucht ist eine Note, die einen halben Schlag dauert.', LOOKS.e, ANSWER_FOLLOWS],
  },
  4: {
    'hq_': [BAR_RULE, 'Hier sind schon drei Schläge.', MISSING.q, ANSWER_FOLLOWS],
    'qq_': [BAR_RULE, 'Hier sind schon zwei Schläge.', MISSING.h, ANSWER_FOLLOWS],
  },
};

export function explanation(task: Task): Text {
  return EXAMPLE_TEXTS[task.stage][task.key] ?? [QUESTIONS[task.stage]];
}

export function question(task: Task): Text {
  return [QUESTIONS[task.stage]];
}

/** Help: the look of the note, the note of the length, or how to count; the fields come with it. */
export function help(task: Task): Text {
  switch (task.stage) {
    case 1:
      return [LOOKS[task.value]];
    case 2:
      return [GROUP_HELP];
    case 3:
      return [RULES[task.value]];
    case 4:
      return [BAR_RULE, BAR_HELP];
  }
}

/** After a wrong answer: why the chosen one does not fit, then the right one. */
export function mistake(task: Task, chosen: number): Text {
  const picked = task.options[chosen];
  switch (task.stage) {
    case 1:
      return [LOOK_TOGETHER, LOOKS[task.value], RULES[task.value]];
    case 2:
      return [LOOK_TOGETHER, groupLength(lengthOf(picked)), RULES[task.value]];
    case 3:
      return [LOOK_TOGETHER, RULES[picked[0]], RULES[task.value]];
    case 4: {
      const rest = lengthOf(task.bar!.notes) - EIGHTHS[task.value];
      return [LOOK_TOGETHER, barLength(rest + EIGHTHS[picked[0]]), BAR_RULE, MISSING[task.value as 'q' | 'h']];
    }
  }
}

/** After the answer, with "Richtig!", "Genau!" or "Gemeinsam geschafft!" in front. */
export function confirmation(lead: string, task: Task): Text {
  switch (task.stage) {
    case 1:
    case 3:
      return [lead, RULES[task.value]];
    case 2:
      return [lead, SAME_AS[task.value as Target]];
    case 4:
      return [lead, MISSING[task.value as 'q' | 'h'], BAR_FULL];
  }
}
