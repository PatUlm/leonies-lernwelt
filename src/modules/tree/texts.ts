import { ANSWER_FOLLOWS } from '../../shared/game/texts';
import type { Text } from '../../shared/quiz/course';
import type { Task } from '../../shared/quiz/engine';
import { FACTS, type FactKey, type Part } from './content';

/**
 * Everything the child reads or hears in "Der Baum": fixed sentences, each
 * recorded on its own (scripts/german-texts.ts). Words of the sheets;
 * "dick" and "dünn" only describe what the picture shows.
 */

/** Stage 1: where the part is, so it can be found on any tree. */
export const WHERE: Record<Part, string> = {
  wurzeln: 'Die Wurzeln sind unter der Erde.',
  stamm: 'Der Stamm ist der dicke Teil in der Mitte.',
  krone: 'Die Baumkrone ist der ganze obere Teil des Baumes.',
  ast: 'Der Ast ist dick und wächst aus dem Stamm.',
  zweig: 'Der Zweig ist dünn und wächst aus dem Ast.',
  blatt: 'Das Blatt ist grün und hängt am Zweig.',
  rinde: 'Die Rinde ist außen am Stamm und oft rau.',
  frucht: 'Die Frucht hängt am Zweig.',
};

/** Stage 1: the confirmation. */
export const THIS_IS: Record<Part, string> = {
  wurzeln: 'Das sind die Wurzeln.',
  stamm: 'Das ist der Stamm.',
  krone: 'Das ist die Baumkrone.',
  ast: 'Das ist der Ast.',
  zweig: 'Das ist der Zweig.',
  blatt: 'Das ist das Blatt.',
  rinde: 'Das ist die Rinde.',
  frucht: 'Das ist die Frucht.',
};

export const QUESTIONS = {
  1: 'Wie heißt dieser Teil des Baumes?',
  3: 'Welche Aufgabe hat dieser Teil?',
} as const;

/** Stage 2, after a mistake: the first task of the part chosen. */
const FIRST_FACT: Record<string, FactKey> = { wurzeln: 'w1', stamm: 's1', blaetter: 'b1', rinde: 'r1', frucht: 'f1', krone: 'k1' };

function fact(key: string): string {
  return FACTS[key as FactKey].sentence;
}

export function question(task: Task): Text {
  return [task.stage === 2 ? FACTS[task.key as FactKey].question : QUESTIONS[task.stage as 1 | 3]];
}

export function explanation(task: Task): Text {
  return [task.stage === 1 ? WHERE[task.key as Part] : fact(task.key), ANSWER_FOLLOWS];
}

/** Stage 1: where the part is; stages 2 and 3 take one wrong answer away. */
export function help(task: Task): Text | null {
  return task.stage === 1 ? [WHERE[task.key as Part]] : null;
}

export function mistake(task: Task, chosen: string): Text {
  switch (task.stage) {
    case 1:
      return [WHERE[chosen as Part], WHERE[task.key as Part]];
    case 2:
      return [fact(FIRST_FACT[chosen]), fact(task.key)];
    default:
      return [fact(task.key)];
  }
}

export function confirmation(lead: string, task: Task): Text {
  return [lead, task.stage === 1 ? THIS_IS[task.key as Part] : fact(task.key)];
}
