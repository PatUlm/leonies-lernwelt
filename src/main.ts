import '@fontsource-variable/fredoka';
import './style.css';
import { APP_NAME, CHILD_NAME } from './config';
import { clockModule } from './modules/clock';
import type { LearningModule } from './modules/types';
import { medal, plainStar, skyLayer, trophy } from './shared/decor';
import { Sound } from './shared/sound';
import { loadSettings, saveSettings } from './shared/storage';

/** All learning modules, in dashboard order. */
const MODULES: LearningModule[] = [clockModule];

const app = document.getElementById('app')!;
const settings = loadSettings();
const sound = new Sound(settings.sound);
let cleanup: (() => void) | null = null;

document.title = APP_NAME;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const TITLE_COLORS = ['#ec4899', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];

/** Each word of the title in its own candy colour. */
function colorfulTitle(title: string): string {
  return title
    .split(' ')
    .map((word, i) => `<span style="color:${TITLE_COLORS[i % TITLE_COLORS.length]}">${escapeHtml(word)}</span>`)
    .join(' ');
}

function renderDashboard(): void {
  const stats = MODULES.map((m) => m.stats());
  const stars = stats.reduce((n, s) => n + s.stars, 0);
  const trophies = stats.reduce((n, s) => n + s.trophies, 0);
  const badges = stats.flatMap((s) => s.badges);

  app.className = 'dashboard';
  app.innerHTML = `
    ${skyLayer('dashboard')}
    <header class="dash-header">
      <h1>${colorfulTitle(APP_NAME)}</h1>
      <p class="greeting">Hallo ${escapeHtml(CHILD_NAME)}! Was möchtest du heute üben?</p>
    </header>
    <section class="rewards" aria-label="Deine Sammlung">
      <div class="reward"><span class="reward-icon">${trophy()}</span><span class="reward-count">${trophies}</span><span class="reward-label">Pokale</span></div>
      <div class="reward"><span class="reward-icon">${plainStar('#fbbf24')}</span><span class="reward-count">${stars}</span><span class="reward-label">Sterne</span></div>
      <div class="reward"><span class="reward-icon">${medal()}</span><span class="reward-count">${badges.length}</span><span class="reward-label">Abzeichen</span></div>
    </section>
    <nav class="modules" aria-label="Lernmodule">
      ${MODULES.map(
        (m, i) => `
        <a class="module-tile" href="#/${m.id}">
          <span class="module-icon">${m.icon}</span>
          <span class="module-text">
            <span class="module-title">${escapeHtml(m.title)}</span>
            <span class="module-desc">${escapeHtml(m.description)}</span>
            <span class="module-level">${escapeHtml(stats[i].level)}</span>
          </span>
          <span class="module-go" aria-hidden="true">›</span>
        </a>`,
      ).join('')}
    </nav>
    ${
      badges.length
        ? `<section class="badges" aria-label="Abzeichen"><h2>Deine Abzeichen</h2><ul>${badges
            .map((b) => `<li><span class="badge-icon">${medal()}</span>${escapeHtml(b)}</li>`)
            .join('')}</ul></section>`
        : ''
    }`;
}

function route(): void {
  cleanup?.();
  cleanup = null;
  const id = location.hash.replace(/^#\/?/, '');
  const module = MODULES.find((m) => m.id === id);
  if (!module) {
    renderDashboard();
    return;
  }
  app.className = `module module-${module.id}`;
  cleanup = module.mount(app, {
    exit: () => {
      location.hash = '#/';
    },
    settings,
    saveSettings: () => saveSettings(settings),
    sound,
  });
}

window.addEventListener('hashchange', route);
route();
