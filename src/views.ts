import { AREAS, collectModules, pickRecommendation, type Area, type ModuleEntry } from './areas';
import { APP_NAME, CHILD_NAME } from './config';
import { STATUS_ICONS, wrappedCandy } from './shared/candy';
import { medal, plainStar, skyLayer, trophy } from './shared/decor';

export function escapeHtml(s: string): string {
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

type StatusKind = keyof typeof STATUS_ICONS;

/** Status label: colour plus icon plus text, never colour alone. */
function status(kind: StatusKind, text: string): string {
  return `<span class="status status-${kind}">${STATUS_ICONS[kind]}<span>${escapeHtml(text)}</span></span>`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function rewardsRow(entries: ModuleEntry[], compact = false): string {
  const sum = (pick: (e: ModuleEntry) => number) => entries.reduce((n, e) => n + pick(e), 0);
  const badges = entries.reduce((n, e) => n + e.stats.badges.length, 0);
  return `
    <section class="rewards${compact ? ' compact' : ''}" aria-label="Deine Sammlung">
      <div class="reward"><span class="reward-icon">${trophy()}</span><span class="reward-count">${sum((e) => e.stats.trophies)}</span><span class="reward-label">Pokale</span></div>
      <div class="reward"><span class="reward-icon">${plainStar('#fbbf24')}</span><span class="reward-count">${sum((e) => e.stats.stars)}</span><span class="reward-label">Sterne</span></div>
      <div class="reward"><span class="reward-icon">${medal()}</span><span class="reward-count">${badges}</span><span class="reward-label">Abzeichen</span></div>
    </section>`;
}

function badgeList(entries: ModuleEntry[], heading: string): string {
  const badges = entries.flatMap((e) => e.stats.badges);
  if (!badges.length) return '';
  return `<section class="badges" aria-label="Abzeichen"><h2>${escapeHtml(heading)}</h2><ul>${badges
    .map((b) => `<li><span class="badge-icon">${medal()}</span>${escapeHtml(b)}</li>`)
    .join('')}</ul></section>`;
}

function areaStatus(area: Area, entries: ModuleEntry[], recommended: ModuleEntry | null): string {
  if (!area.modules.length) return status('soon', 'Noch nicht verfügbar');
  if (recommended?.area === area) return status('next', 'Hier weiter');
  if (entries.every((e) => !e.stats.started)) return status('new', 'Neu');
  if (entries.every((e) => e.stats.goals.done === e.stats.goals.total)) return status('secure', 'Sicher gelernt');
  return '';
}

function areaTitle(area: Area): string {
  return area.subtitle
    ? `${escapeHtml(area.title)} <span class="area-subtitle">${escapeHtml(area.subtitle)}</span>`
    : escapeHtml(area.title);
}

export function renderDashboard(app: HTMLElement): void {
  const entries = collectModules();
  const recommended = pickRecommendation(entries);
  const available = AREAS.filter((a) => a.modules.length);
  const upcoming = AREAS.filter((a) => !a.modules.length);

  const bigCard = (area: Area) => {
    const own = entries.filter((e) => e.area === area);
    const badges = own.reduce((n, e) => n + e.stats.badges.length, 0);
    return `
      <a class="area-card" href="#/${area.id}" style="--area:${area.color}">
        <span class="area-candy">${area.candy(area.color)}</span>
        <span class="area-text">
          <span class="area-title">${areaTitle(area)}</span>
          <span class="area-info">${plural(own.length, 'Modul', 'Module')} · ${plural(badges, 'Abzeichen', 'Abzeichen')}</span>
          ${areaStatus(area, own, recommended)}
        </span>
        <span class="area-go" aria-hidden="true">›</span>
      </a>`;
  };
  const smallCard = (area: Area) => `
      <div class="area-card small" style="--area:${area.color}" aria-disabled="true">
        <span class="area-candy">${area.candy(area.color)}</span>
        <span class="area-title">${areaTitle(area)}</span>
        ${areaStatus(area, [], recommended)}
      </div>`;

  app.className = 'dashboard';
  app.innerHTML = `
    ${skyLayer('dashboard')}
    <header class="dash-header">
      <h1>${colorfulTitle(APP_NAME)}</h1>
      <p class="greeting">Hallo ${escapeHtml(CHILD_NAME)}! Was möchtest du heute üben?</p>
    </header>
    ${rewardsRow(entries)}
    <nav class="areas" aria-label="Lernbereiche">${available.map(bigCard).join('')}</nav>
    ${
      upcoming.length
        ? `<section class="areas-more" aria-label="Weitere Lernbereiche"><h2>Weitere Lernbereiche</h2>
             <div class="areas-grid">${upcoming.map(smallCard).join('')}</div></section>`
        : ''
    }
    ${badgeList(entries, 'Deine Abzeichen')}`;
}

/** Six (or as many as there are goals) small sweets, filled per goal reached. */
function goalCandies(entry: ModuleEntry): string {
  const { done, total } = entry.stats.goals;
  return Array.from({ length: total }, (_, i) =>
    `<span class="goal${i < done ? ' done' : ''}">${wrappedCandy(i < done ? entry.area.color : '#e7e2da')}</span>`,
  ).join('');
}

export function renderArea(app: HTMLElement, area: Area): void {
  const all = collectModules();
  const recommended = pickRecommendation(all);
  const entries = all.filter((e) => e.area === area);

  const moduleCard = (entry: ModuleEntry) => {
    const { module, stats } = entry;
    let badge = '';
    if (recommended?.module === module) badge = status('next', `Hier weiter · ${stats.suggestion.label}`);
    else if (!stats.started) badge = status('new', 'Neu');
    else if (stats.goals.done === stats.goals.total) badge = status('secure', 'Sicher gelernt');
    return `
      <a class="module-tile" href="#/${area.id}/${module.id}" style="--area:${area.color}">
        <span class="module-icon">${module.icon}</span>
        <span class="module-text">
          <span class="module-title">${escapeHtml(module.title)}</span>
          <span class="module-desc">${escapeHtml(module.description)}</span>
          <span class="goals" aria-label="${escapeHtml(stats.goals.label)}">${goalCandies(entry)}</span>
          <span class="module-level">${escapeHtml(stats.goals.label)}${
            stats.round ? ` · ${stats.round.points} / ${stats.round.target} Punkte` : ''
          }</span>
          ${badge}
        </span>
        <span class="module-start">${stats.round ? 'Fortsetzen' : 'Starten'}</span>
      </a>`;
  };

  app.className = 'area-page';
  app.style.setProperty('--area', area.color);
  app.innerHTML = `
    ${skyLayer('dashboard')}
    <header class="area-header">
      <a class="back-link" href="#/">‹ Übersicht</a>
      <span class="area-candy big">${area.candy(area.color)}</span>
      <h1>${areaTitle(area)}</h1>
    </header>
    ${rewardsRow(entries, true)}
    <nav class="modules" aria-label="Module">${entries.map(moduleCard).join('')}</nav>
    ${badgeList(entries, `Deine ${area.title}-Abzeichen`)}`;
}
