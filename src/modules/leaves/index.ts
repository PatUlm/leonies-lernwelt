import { mountQuiz, quizStats } from '../../shared/quiz/game';
import type { LearningModule } from '../types';
import { leavesCourse } from './course';

/** A maple leaf and an acorn. */
const ICON = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <g stroke="#2e7d32" stroke-width="2.5" stroke-linejoin="round">
    <path d="M38 88V66" fill="none" stroke-width="4" stroke-linecap="round"/>
    <path d="M38 66L22 72L24 62L10 56L18 50L12 38L26 40L28 30L36 38L38 14L46 34L54 26L54 40L66 38L60 50L68 56L54 62L56 72Z" fill="#5fb35f"/>
  </g>
  <g stroke="#5d3a1a" stroke-width="2.5" stroke-linejoin="round">
    <ellipse cx="74" cy="78" rx="12" ry="15" fill="#c98a3c"/>
    <path d="M60 70c0-12 28-12 28 0c0 4-28 4-28 0Z" fill="#8d6234"/>
    <path d="M74 60v-6" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

export const leavesModule: LearningModule = {
  id: 'laubbaeume',
  title: 'Laubbäume',
  description: 'Ahorn, Eiche, Kastanie & Co.: Welcher Baum hat dieses Blatt und diese Frucht?',
  icon: ICON,
  addedIn: '2026.11.1',
  stats: () => quizStats(leavesCourse),
  mount: (root, ctx) => mountQuiz(leavesCourse, root, ctx),
};
