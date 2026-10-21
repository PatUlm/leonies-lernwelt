import { ANSWER_FOLLOWS } from '../../shared/game/texts';
import { EIGHTHS, ROW_EIGHTHS, lengthOf, type Value } from './content';
import type { Stage, Task } from './engine';

/**
 * Everything the child reads or hears in "Notenwerte". A message is a list
 * of fixed sentences, each recorded on its own (scripts/german-texts.ts).
 * Short on purpose: at most two sentences before the answer. The length is
 * always said in beats: the names "kurz, mittel, lang" from school are not
 * clear yet, rhythm syllables are not taught.
 */
export type Text = string[];

/** How long a note lasts. */
export const RULES: Record<Value, string> = {
  e: 'Die Achtelnote dauert einen halben Schlag.',
  q: 'Die Viertelnote dauert einen Schlag.',
  h: 'Die halbe Note dauert zwei Schläge.',
};

/** How to tell a note by its look: only what sets it apart from the other two. */
export const LOOKS: Record<Value, string> = {
  e: 'Ausgemalt, mit Fähnchen: die Achtelnote.',
  q: 'Ausgemalt, ohne Fähnchen: die Viertelnote.',
  h: 'Innen leer: die halbe Note.',
};

export const QUESTIONS: Record<Stage, string> = {
  1: 'Wie lange dauert diese Note?',
  2: 'Welche Note dauert so lange?',
  3: 'Welche Note fehlt für zwei Schläge?',
};

/** Praise for an independent right answer, taken in turn for some variety. */
export const PRAISE = ['Richtig!', 'Genau!', 'Das passt!'];

/** Stage 2: the length asked for. */
export const WANTED: Record<Value, string> = {
  e: 'Gesucht ist eine Note, die einen halben Schlag dauert.',
  q: 'Gesucht ist eine Note, die einen Schlag dauert.',
  h: 'Gesucht ist eine Note, die zwei Schläge dauert.',
};

export const ROW_RULE = 'Zusammen sollen es zwei Schläge sein.';
export const ROW_HELP = 'Schau auf die Felder: Wie viel fehlt noch?';
export const ROW_FULL = 'Jetzt sind es zwei Schläge.';
export const TOO_SHORT = 'Damit sind die zwei Schläge noch nicht voll.';
export const TOO_LONG = 'Damit werden es mehr als zwei Schläge.';

/** Stage 3, in an example: what the gap needs, before the answer lights up. */
export const STILL_MISSING: Record<Value, string> = {
  e: 'Ein halber Schlag fehlt noch.',
  q: 'Ein Schlag fehlt noch.',
  h: 'Beide Schläge fehlen noch.',
};

/** Stage 3, after a mistake: what the gap needs, with the note. */
export const MISSING: Record<Value, string> = {
  e: 'Es fehlt ein halber Schlag: die Achtelnote.',
  q: 'Es fehlt ein Schlag: die Viertelnote.',
  h: 'Es fehlen zwei Schläge: die halbe Note.',
};

/** The guided example of a task, read aloud at once; the answer lights up afterwards. */
export function explanation(task: Task): Text {
  switch (task.stage) {
    case 1:
      return [LOOKS[task.value], RULES[task.value], ANSWER_FOLLOWS];
    case 2:
      return [WANTED[task.value], LOOKS[task.value], ANSWER_FOLLOWS];
    case 3:
      return [ROW_RULE, STILL_MISSING[task.value], ANSWER_FOLLOWS];
  }
}

export function question(task: Task): Text {
  return [QUESTIONS[task.stage]];
}

/** Help: the look of the note, the note of the length, or how to count. */
export function help(task: Task): Text {
  switch (task.stage) {
    case 1:
      return [LOOKS[task.value]];
    case 2:
      return [RULES[task.value]];
    case 3:
      return [ROW_HELP];
  }
}

/** After a wrong answer: why the chosen one does not fit, then the right one. */
export function mistake(task: Task, chosen: number): Text {
  const picked = task.options[chosen];
  switch (task.stage) {
    case 1:
      return [LOOKS[task.value], RULES[task.value]];
    case 2:
      return [RULES[picked], RULES[task.value]];
    case 3: {
      const filled = lengthOf(task.row!.notes) - EIGHTHS[task.value] + EIGHTHS[picked];
      return [filled < ROW_EIGHTHS ? TOO_SHORT : TOO_LONG, MISSING[task.value]];
    }
  }
}

/** After the answer, with praise, "Genau!" or "Gemeinsam geschafft!" in front. */
export function confirmation(lead: string, task: Task): Text {
  return [lead, task.stage === 3 ? ROW_FULL : RULES[task.value]];
}
