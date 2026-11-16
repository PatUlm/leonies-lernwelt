import type { QuizCourse } from '../../shared/quiz/course';
import { FRUIT_PARTNERS, FRUIT_STEPS, LEAF_PARTNERS, LEAF_STEPS, NAMES } from './content';
import { FRUIT_SVG, LEAF_SVG, type Tree } from './pictures';
import { confirmation, explanation, help, mistake, question } from './texts';

export const leavesCourse: QuizCourse = {
  title: 'Laubbäume',
  object: 'Laubbäume',
  storageKey: 'laubbaeume.progress.v1',
  cardClass: 'leaves-card',
  stages: [
    {
      name: 'Bäume am Blatt erkennen',
      badge: 'Sechs Laubbäume erkennst du sicher am Blatt.',
      steps: LEAF_STEPS,
      minDistinct: 5,
    },
    {
      name: 'Bäume an der Frucht erkennen',
      badge: 'Sechs Laubbäume erkennst du sicher an der Frucht.',
      steps: FRUIT_STEPS,
      minDistinct: 5,
    },
  ],

  answer: (_stage, key) => key,
  partners: (stage, key) => (stage === 1 ? LEAF_PARTNERS : FRUIT_PARTNERS)[key as Tree],

  card(task) {
    const tree = task.key as Tree;
    return task.stage === 1
      ? { html: LEAF_SVG[tree], label: 'Ein Blatt' }
      : { html: FRUIT_SVG[tree], label: 'Eine Frucht' };
  },
  option(_stage, answer) {
    const text = NAMES[answer as Tree];
    return { html: `<span class="quiz-text">${text}</span>`, label: text };
  },
  textAnswers: () => true,
  question,
  explanation,
  help,
  mistake,
  confirmation,
  legend: `Nach den HSU-Steckbriefen der Laubbäume (Klasse 3): Ahorn, Eiche, Kastanie, Linde, Birke und Buche. Stufe 1:
    zum Blatt den Baum wählen – erst Ahorn, Eiche und Kastanie, dann Linde und Birke, zuletzt die Buche. Stufe 2: zur Frucht
    den Baum wählen. Ähnliche Blätter und Früchte stehen bewusst nebeneinander. Hilfe: woran man Blatt oder Frucht erkennt.
    Blattform und Blattrand als Fachwörter folgen später.`,
};
