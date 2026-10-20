import type { LearningModule } from '../types';
import { mountNotesGame, notesStats } from './game';

/** A half note and an eighth on a beat field. */
const ICON = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <rect x="10" y="78" width="44" height="14" rx="5" fill="#b39ddb"/>
  <rect x="60" y="78" width="20" height="14" rx="5" fill="#b39ddb"/>
  <line x1="32" y1="80" x2="32" y2="90" stroke="#fff" stroke-width="2.5"/>
  <g stroke="#1e3a5f" stroke-linecap="round">
    <ellipse cx="26" cy="60" rx="11" ry="8" transform="rotate(-22 26 60)" fill="#fff" stroke-width="4"/>
    <line x1="36" y1="57" x2="36" y2="12" stroke-width="4"/>
    <ellipse cx="66" cy="60" rx="11" ry="8" transform="rotate(-22 66 60)" fill="#1e3a5f" stroke-width="0"/>
    <line x1="76" y1="57" x2="76" y2="12" stroke-width="4"/>
    <path d="M76 12c2 10 15 13 12 30" fill="none" stroke-width="4.5"/>
  </g>
</svg>`;

export const notesModule: LearningModule = {
  id: 'noten',
  title: 'Notenwerte',
  description: 'Wie lange dauert eine Note? Ganze, halbe, Viertel- und Achtelnoten im 4/4-Takt.',
  icon: ICON,
  stats: notesStats,
  mount: mountNotesGame,
};
