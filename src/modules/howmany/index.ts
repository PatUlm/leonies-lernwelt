import type { LearningModule } from '../types';
import { howManyStats, mountHowManyGame } from './game';

/** Two ghosts to count and a question mark. */
const ICON = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <g fill="#fff" stroke="#1e3a5f" stroke-width="4" stroke-linejoin="round">
    <path d="M8 88V52a20 20 0 0 1 40 0v36l-7-5-6.5 5-6.5-5-6.5 5-6.5-5Z"/>
    <path d="M42 64V36a18 18 0 0 1 36 0v28l-6-4.5-6 4.5-6-4.5-6 4.5-6-4.5Z"/>
  </g>
  <g fill="#1e3a5f">
    <circle cx="22" cy="54" r="3.5"/><circle cx="34" cy="54" r="3.5"/>
    <circle cx="54" cy="38" r="3"/><circle cx="66" cy="38" r="3"/>
  </g>
  <text x="88" y="92" font-family="Fredoka Variable, sans-serif" font-weight="700" font-size="34" fill="#3b82f6" text-anchor="middle">?</text>
</svg>`;

export const howManyModule: LearningModule = {
  id: 'howmany',
  title: 'How many?',
  description: 'Fragen nach der Anzahl beantworten: There is one ghost. There are two ghosts.',
  icon: ICON,
  stats: howManyStats,
  mount: mountHowManyGame,
};
