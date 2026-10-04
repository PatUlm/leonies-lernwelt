import type { LearningModule } from '../types';
import { clockStats, mountClockGame } from './game';

const ICON = `<svg viewBox="-50 -50 100 100" aria-hidden="true">
  <circle r="44" fill="#fff" stroke="#1e3a5f" stroke-width="5"/>
  ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="-38" x2="0" y2="-32" stroke="#1e3a5f" stroke-width="3" transform="rotate(${i * 30})"/>`).join('')}
  <line x1="0" y1="0" x2="0" y2="-30" stroke="#f97316" stroke-width="5" stroke-linecap="round" transform="rotate(270)"/>
  <line x1="0" y1="0" x2="0" y2="-20" stroke="#2563eb" stroke-width="8" stroke-linecap="round" transform="rotate(75)"/>
  <circle r="5" fill="#1e3a5f"/>
</svg>`;

export const clockModule: LearningModule = {
  id: 'uhr',
  title: 'Die Uhr',
  description: 'Die Uhrzeit auf der Zeigeruhr lesen – Schritt für Schritt.',
  icon: ICON,
  stats: clockStats,
  mount: mountClockGame,
};
