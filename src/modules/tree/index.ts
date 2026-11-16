import { mountQuiz, quizStats } from '../../shared/quiz/game';
import type { LearningModule } from '../types';
import { treeCourse } from './course';

/** A small tree: crown, trunk and roots. */
const ICON = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M0 74H100V100H0Z" fill="#ecdcc0"/>
  <path d="M0 74H100" stroke="#7cb342" stroke-width="4"/>
  <g stroke="#8d5a32" stroke-linecap="round" fill="none">
    <path d="M46 76C40 84 32 88 22 92M50 77V96M54 76C60 84 68 88 78 92" stroke-width="4"/>
  </g>
  <path d="M42 76C46 66 46 56 47 46H53C54 56 54 66 58 76Z" fill="#7a4a26"/>
  <path d="M24 42C10 38 10 18 26 16C28 4 46 0 54 8C66 0 84 6 82 20C94 26 92 42 78 46C70 52 58 50 50 46C40 52 30 50 24 42Z" fill="#5fb35f" stroke="#2e7d32" stroke-width="2.5"/>
  <circle cx="34" cy="28" r="4" fill="#e0533a"/><circle cx="66" cy="34" r="4" fill="#e0533a"/>
</svg>`;

export const treeModule: LearningModule = {
  id: 'baum',
  title: 'Der Baum',
  description: 'Wurzeln, Stamm und Baumkrone: Wie heißen die Teile, und was machen sie?',
  icon: ICON,
  stats: () => quizStats(treeCourse),
  mount: (root, ctx) => mountQuiz(treeCourse, root, ctx),
};
