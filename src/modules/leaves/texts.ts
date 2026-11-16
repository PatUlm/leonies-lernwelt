import { ANSWER_FOLLOWS } from '../../shared/game/texts';
import type { Text } from '../../shared/quiz/course';
import type { Task } from '../../shared/quiz/engine';
import type { Tree } from './pictures';

/**
 * Everything the child reads or hears in "Laubbäume": fixed sentences, each
 * recorded on its own (scripts/german-texts.ts). What sets a leaf or fruit
 * apart, in the words of the fact cards, and the tree.
 */

/** Stage 1: how to tell the leaf. */
export const LEAF: Record<Tree, string> = {
  ahorn: 'Ein einziges Blatt, geformt wie eine Hand: der Ahorn.',
  kastanie: 'Mehrere Teilblätter wie Finger an einer Hand: die Kastanie.',
  eiche: 'Der Rand hat tiefe, runde Buchten: die Eiche.',
  linde: 'Das Blatt sieht aus wie ein Herz: die Linde.',
  birke: 'Ein Dreieck mit langer Spitze: die Birke.',
  buche: 'Wie ein Ei, mit leicht gewelltem Rand: die Buche.',
};

/** Stage 2: how to tell the fruit. */
export const FRUIT: Record<Tree, string> = {
  eiche: 'Die Eichel sitzt in einem kleinen Becher: die Eiche.',
  kastanie: 'Grüne, stachelige Hülle, darin eine braune, glänzende Kastanie.',
  ahorn: 'Zwei Flügel, die sich wie ein Hubschrauber drehen: der Ahorn.',
  buche: 'Bucheckern sind braun und haben drei Kanten: die Buche.',
  linde: 'Runde Nüsschen an einem Stiel mit langem Flügel: die Linde.',
  birke: 'Winzige Nüsschen in einem länglichen Kätzchen: die Birke.',
};

/** "vom Ahorn", "von der Eiche". */
const FROM: Record<Tree, string> = {
  ahorn: 'vom Ahorn',
  eiche: 'von der Eiche',
  kastanie: 'von der Kastanie',
  linde: 'von der Linde',
  birke: 'von der Birke',
  buche: 'von der Buche',
};

export const IS_LEAF = Object.fromEntries(
  Object.entries(FROM).map(([tree, from]) => [tree, `Das ist ein Blatt ${from}.`]),
) as Record<Tree, string>;

export const IS_FRUIT = Object.fromEntries(
  Object.entries(FROM).map(([tree, from]) => [tree, `Das ist eine Frucht ${from}.`]),
) as Record<Tree, string>;

export const QUESTIONS = {
  1: 'Von welchem Baum ist dieses Blatt?',
  2: 'Von welchem Baum ist diese Frucht?',
} as const;

function looks(stage: number): Record<Tree, string> {
  return stage === 1 ? LEAF : FRUIT;
}

export function question(task: Task): Text {
  return [QUESTIONS[task.stage as 1 | 2]];
}

export function explanation(task: Task): Text {
  return [looks(task.stage)[task.key as Tree], ANSWER_FOLLOWS];
}

export function help(task: Task): Text {
  return [looks(task.stage)[task.key as Tree]];
}

export function mistake(task: Task, chosen: string): Text {
  const by = looks(task.stage);
  return [by[chosen as Tree], by[task.key as Tree]];
}

export function confirmation(lead: string, task: Task): Text {
  return [lead, (task.stage === 1 ? IS_LEAF : IS_FRUIT)[task.key as Tree]];
}
