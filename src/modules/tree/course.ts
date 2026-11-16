import type { QuizCourse } from '../../shared/quiz/course';
import {
  CARD_PARTNERS, CARD_STEPS, FACTS, NAMES, NAME_PARTNERS, NAME_STEPS, TASK_PARTNERS, TASK_STEPS, partOf,
  type FactKey, type Part,
} from './content';
import { treeSvg } from './pictures';
import { confirmation, explanation, help, mistake, question } from './texts';

/** The name in the box of the marked part: "die Blätter" do the tasks of the leaves. */
function markName(stage: number, key: string): string {
  return stage === 1 ? NAMES[key as Part] : NAMES[FACTS[key as FactKey].part];
}

export const treeCourse: QuizCourse = {
  title: 'Der Baum',
  object: 'Den Baum',
  storageKey: 'baum.progress.v1',
  cardClass: 'tree-card',
  stages: [
    {
      name: 'Teile des Baumes',
      badge: 'Die Teile des Baumes kennst du schon sicher.',
      steps: NAME_STEPS,
      minDistinct: 6,
    },
    {
      name: 'Welcher Teil macht das?',
      badge: 'Du weißt sicher, welcher Teil welche Aufgabe hat.',
      steps: TASK_STEPS,
      minDistinct: 6,
    },
    {
      name: 'Welche Aufgabe hat der Teil?',
      badge: 'Die Aufgaben der Baumteile kennst du schon sicher.',
      steps: CARD_STEPS,
      minDistinct: 6,
    },
  ],

  answer(stage, key) {
    return stage === 2 ? FACTS[key as FactKey].part : key;
  },
  excluded(stage, key, answer) {
    // The other task of the same part would be right, too.
    return stage === 3 && FACTS[answer as FactKey].part === FACTS[key as FactKey].part;
  },
  partners(stage, key) {
    if (stage === 1) return NAME_PARTNERS[key as Part];
    return (stage === 2 ? TASK_PARTNERS : CARD_PARTNERS)[key as FactKey] ?? [];
  },

  card(task, answered) {
    const part = partOf(task.stage, task.key);
    const name = markName(task.stage, task.key);
    // Stage 2 asks for the part: the tree shows it only in the example and once answered.
    if (task.stage === 2 && !answered && task.kind !== 'example') return { html: treeSvg(null), label: 'Ein Baum' };
    const known = answered || task.stage === 3;
    return {
      html: treeSvg(part, known ? name : null),
      label: known ? `Ein Baum, markiert: ${name}` : 'Ein Baum, ein Teil ist markiert',
    };
  },
  option(stage, answer) {
    const text = stage === 3 ? FACTS[answer as FactKey].card! : NAMES[answer as Part | 'blaetter'];
    return { html: `<span class="quiz-text">${text}</span>`, label: text };
  },
  textAnswers: () => true,
  question,
  explanation,
  help,
  mistake,
  confirmation,
  legend: `Nach den HSU-Blättern „Teile eines Laubbaumes“ und „Bau und Leben eines Baumes“ (Klasse 3). Stufe 1: einen
    markierten Teil benennen – erst Wurzeln, Stamm und Baumkrone, dann Ast, Zweig und Blatt, zuletzt Rinde und Frucht.
    Stufe 2: zu einer Aufgabe den Teil wählen („Welcher Teil trägt die Baumkrone?“). Stufe 3: zum markierten Teil die
    Aufgabe wählen. Hilfe in Stufe 1: wo der Teil ist; in Stufe 2 und 3 verschwindet eine falsche Antwort.`,
};
