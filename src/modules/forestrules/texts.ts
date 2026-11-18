import { ANSWER_FOLLOWS } from '../../shared/game/texts';
import type { Text } from '../../shared/quiz/course';
import type { Task } from '../../shared/quiz/engine';
import { RULE_TEXT, STATEMENTS, type Judgement, type StatementKey } from './content';
import type { Rule } from './pictures';

/**
 * Everything the child reads or hears in "Waldregeln": fixed sentences, each
 * recorded on its own (scripts/german-texts.ts). The rules and statements in
 * the words of the sheets; why a rule matters is an addition, said after the
 * answer and in the help, never asked.
 */

/** Stage 1: what the scene shows. */
export const SEEN: Record<Rule, string> = {
  weg: 'Das Kind läuft nur auf dem Weg.',
  muell: 'Das Kind packt seinen Müll in den Rucksack.',
  leise: 'Das Kind legt den Finger auf den Mund.',
  pflanzen: 'Das Kind schaut die Blume nur an.',
  gruppe: 'Die Kinder bleiben alle zusammen.',
  ruecksicht: 'Das Kind hält Abstand und lässt den Igel in Ruhe.',
};

/** Stage 1: why the rule matters, after the answer. */
export const WHY: Record<Rule, string> = {
  weg: 'Neben dem Weg wachsen junge Pflanzen und wohnen Tiere.',
  muell: 'Müll kann Tiere krank machen.',
  leise: 'Lärm erschreckt die Tiere.',
  pflanzen: 'Tiere brauchen die Pflanzen als Futter und Versteck.',
  gruppe: 'Im Wald kann man sich leicht verlaufen.',
  ruecksicht: 'Der Wald ist das Zuhause der Tiere.',
};

/** Stage 1, after a mistake: the rule of the scene. */
export const RULE_IS = Object.fromEntries(
  Object.entries(RULE_TEXT).map(([rule, text]) => [rule, `Die Regel heißt: ${text}`]),
) as Record<Rule, string>;

/** Stage 2, after a mistake: the judgement. */
export const VERDICT: Record<Judgement, string> = {
  richtig: 'Das ist im Wald richtig.',
  falsch: 'Das ist im Wald falsch.',
};

export const QUESTIONS = {
  1: 'Welche Waldregel zeigt das Bild?',
  2: 'Ist das im Wald richtig oder falsch?',
} as const;

function statement(key: string) {
  return STATEMENTS[key as StatementKey];
}

export function question(task: Task): Text {
  return [QUESTIONS[task.stage as 1 | 2]];
}

/** Stage 2: the speaker reads the statement on the sign, then the question. */
export function read(task: Task): Text {
  return task.stage === 2 ? [statement(task.key).text, QUESTIONS[2]] : question(task);
}

/** Stage 2 reads the statement first: it is the task, the reason the explanation. */
export function explanation(task: Task): Text {
  if (task.stage === 1) return [SEEN[task.key as Rule], ANSWER_FOLLOWS];
  return [statement(task.key).text, statement(task.key).why, ANSWER_FOLLOWS];
}

/** Stage 1: what the scene shows; stage 2: why (two buttons: taking one away would tell). */
export function help(task: Task): Text {
  return task.stage === 1 ? [SEEN[task.key as Rule]] : [statement(task.key).why];
}

export function mistake(task: Task): Text {
  if (task.stage === 1) return [SEEN[task.key as Rule], RULE_IS[task.key as Rule]];
  const s = statement(task.key);
  return [VERDICT[s.judgement], s.why];
}

/** "Richtig!" would sound odd for a statement that is wrong: there it is "Genau!". */
export function confirmation(lead: string, task: Task): Text {
  if (task.stage === 1) return [lead, WHY[task.key as Rule]];
  return [lead === 'Richtig!' ? 'Genau!' : lead, statement(task.key).why];
}
