import type { LearningModule } from '../types';
import { inverseStats, mountInverseGame } from './game';

/** A gap task and the way back: "__ + 23 = 90" with an arrow back to "90 − 23". */
const ICON = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <rect x="6" y="12" width="88" height="30" rx="10" fill="#fff" stroke="#1e3a5f" stroke-width="4"/>
  <rect x="13" y="18" width="18" height="18" rx="4" fill="#fde68a" stroke="#1e3a5f" stroke-width="3"/>
  <rect x="6" y="60" width="88" height="30" rx="10" fill="#fff" stroke="#1e3a5f" stroke-width="4"/>
  <path d="M84 46 C 92 52, 92 54, 84 58" fill="none" stroke="#ec4899" stroke-width="4" stroke-linecap="round"/>
  <path d="M84 58 l 5 -1 M84 58 l 2 -5" stroke="#ec4899" stroke-width="4" stroke-linecap="round"/>
  <g font-family="Fredoka Variable, sans-serif" font-weight="700" fill="#1e3a5f">
    <text x="35" y="33" font-size="15">+23=90</text>
    <text x="50" y="81" font-size="17" text-anchor="middle">90 − 23</text>
  </g>
</svg>`;

export const inverseModule: LearningModule = {
  id: 'umkehr',
  title: 'Umkehraufgaben',
  description: 'Platzhalteraufgaben rückwärts lösen: erst die Zehner, dann die Einer.',
  icon: ICON,
  stats: inverseStats,
  mount: mountInverseGame,
};
