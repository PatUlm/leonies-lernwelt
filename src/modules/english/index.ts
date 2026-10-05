import type { LearningModule } from '../types';
import { englishStats, mountEnglishGame } from './game';

/** A speech bubble with "Hi!", a colour dot and a number. */
const ICON = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M14 10h72a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H44L26 84V66H14a8 8 0 0 1-8-8V18a8 8 0 0 1 8-8Z" fill="#fff" stroke="#1e3a5f" stroke-width="4" stroke-linejoin="round"/>
  <text x="50" y="50" font-family="Fredoka Variable, sans-serif" font-weight="700" font-size="28" fill="#1e3a5f" text-anchor="middle">Hi!</text>
  <circle cx="66" cy="84" r="9" fill="#ef4444" stroke="#1e3a5f" stroke-width="3"/>
  <text x="88" y="93" font-family="Fredoka Variable, sans-serif" font-weight="700" font-size="22" fill="#3b82f6" text-anchor="middle">3</text>
</svg>`;

export const englishModule: LearningModule = {
  id: 'woerter',
  title: 'Farben, Zahlen, Tiere',
  description: 'Erste englische Wörter hören und lesen: Farben, Zahlen bis 20, Haustiere und Zootiere.',
  icon: ICON,
  stats: englishStats,
  mount: mountEnglishGame,
};
