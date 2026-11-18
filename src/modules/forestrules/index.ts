import { mountQuiz, quizStats } from '../../shared/quiz/game';
import type { LearningModule } from '../types';
import { forestRulesCourse } from './course';

/** A wooden sign with a tick, next to a fir tree. */
const ICON = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M74 14L90 46H80L94 72H54L68 46H58Z" fill="#5fb35f" stroke="#2e7d32" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M74 72V88" stroke="#7a4a26" stroke-width="5" stroke-linecap="round"/>
  <path d="M30 56V92" stroke="#7a4a26" stroke-width="6" stroke-linecap="round"/>
  <rect x="8" y="22" width="46" height="36" rx="6" fill="#d9a066" stroke="#7a4a26" stroke-width="3"/>
  <path d="M19 40L28 49L44 31" fill="none" stroke="#16a34a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M0 92H100" stroke="#7cb342" stroke-width="5"/>
</svg>`;

export const forestRulesModule: LearningModule = {
  id: 'waldregeln',
  title: 'Waldregeln',
  description: 'Auf dem Weg bleiben, leise sein, Müll mitnehmen: Was ist im Wald richtig, was falsch?',
  icon: ICON,
  addedIn: '2026.11.3',
  stats: () => quizStats(forestRulesCourse),
  mount: (root, ctx) => mountQuiz(forestRulesCourse, root, ctx),
};
