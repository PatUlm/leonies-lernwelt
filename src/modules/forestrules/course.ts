import { escapeHtml } from '../../shared/html';
import type { QuizCourse } from '../../shared/quiz/course';
import { JUDGEMENTS, RULE_PARTNERS, RULE_STEPS, RULE_TEXT, STATEMENTS, STATEMENT_STEPS, type StatementKey } from './content';
import { SCENE_SVG, type Rule } from './pictures';
import { confirmation, explanation, help, mistake, question, read } from './texts';

/** Stage 2: the statement on a wooden sign. */
function sign(text: string): string {
  return `<div class="rule-sign"><span class="rule-sign-text">${escapeHtml(text)}</span></div>`;
}

export const forestRulesCourse: QuizCourse = {
  title: 'Waldregeln',
  object: 'Die Waldregeln',
  storageKey: 'waldregeln.progress.v1',
  cardClass: 'rules-card',
  stages: [
    {
      name: 'Waldregeln erkennen',
      badge: 'Die sechs Waldregeln erkennst du sicher.',
      steps: RULE_STEPS,
      minDistinct: 5,
    },
    {
      name: 'Richtig oder falsch?',
      badge: 'Du weißt sicher, was im Wald richtig und was falsch ist.',
      steps: STATEMENT_STEPS,
      // Two buttons: many different statements, so guessing does not get through.
      minDistinct: 8,
    },
  ],

  answer: (stage, key) => (stage === 1 ? key : STATEMENTS[key as StatementKey].judgement),
  partners: (stage, key) => (stage === 1 ? RULE_PARTNERS[key as Rule] : []),
  order: (stage) => (stage === 2 ? JUDGEMENTS : undefined),

  card(task, answered) {
    if (task.stage === 1) return { html: SCENE_SVG[task.key as Rule], label: 'Ein Bild aus dem Wald' };
    const s = STATEMENTS[task.key as StatementKey];
    // Once answered, the scene of the rule behind it shows how it is done right.
    const scene = answered && s.rule ? SCENE_SVG[s.rule] : '';
    return { html: `<div class="rule-statement">${sign(s.text)}${scene}</div>`, label: s.text };
  },
  option(stage, answer) {
    if (stage === 1) {
      const text = RULE_TEXT[answer as Rule];
      return { html: `<span class="quiz-text">${escapeHtml(text)}</span>`, label: text };
    }
    const right = answer === 'richtig';
    const text = right ? 'Richtig' : 'Falsch';
    return { html: `<span class="judgement ${answer}"><span aria-hidden="true">${right ? '✓' : '✗'}</span> ${text}</span>`, label: text };
  },
  textAnswers: (stage) => stage === 1,
  question,
  read,
  explanation,
  help,
  mistake,
  confirmation,
  legend: `Nach den HSU-Blättern „Unsere Waldregeln“ (Klasse 3). Stufe 1: zu einem Bild die Waldregel wählen – erst Weg,
    Müll und leise sein, dann Pflanzen heile lassen und bei der Gruppe bleiben, zuletzt Rücksicht. Die Bilder zeigen nur
    richtiges Verhalten. Stufe 2: die elf Aussagen vom Blatt als richtig oder falsch einordnen; danach zeigt ein Bild, wie es
    richtig geht. Warum eine Regel wichtig ist, hört das Kind nach jeder Antwort, abgefragt wird es nicht. Hilfe: was das
    Bild zeigt (Stufe 1) oder warum (Stufe 2).`,
};
