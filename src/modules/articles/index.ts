import type { LearningModule } from '../types';
import { articleStats, mountArticleGame } from './game';

/** Three word cards: "der", "die", "das". */
const ICON = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <rect x="8" y="10" width="84" height="24" rx="10" fill="#fff" stroke="#1e3a5f" stroke-width="4"/>
  <rect x="8" y="38" width="84" height="24" rx="10" fill="#fff" stroke="#1e3a5f" stroke-width="4"/>
  <rect x="8" y="66" width="84" height="24" rx="10" fill="#fff" stroke="#1e3a5f" stroke-width="4"/>
  <g font-family="Fredoka Variable, sans-serif" font-weight="700" font-size="19" fill="#1e3a5f" text-anchor="middle">
    <text x="50" y="29">der</text>
    <text x="50" y="57">die</text>
    <text x="50" y="85">das</text>
  </g>
</svg>`;

export const articleModule: LearningModule = {
  id: 'artikel',
  title: 'Der, die, das',
  description: 'Nomen und ihre Artikel: der, die, das – ein, eine.',
  icon: ICON,
  stats: articleStats,
  mount: mountArticleGame,
};
