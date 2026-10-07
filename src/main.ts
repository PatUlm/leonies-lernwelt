import '@fontsource-variable/fredoka';
import './style.css';
import { AREAS } from './areas';
import { appTitle } from './config';
import { Sound } from './shared/sound';
import { DELETE_PROFILE_ROUTE, renderDeleteProfile } from './deleteProfile';
import { renderLogin } from './login';
import { listenForInstallPrompt } from './shared/install';
import { prepareSpeech } from './shared/speech';
import { loadSettings, saveSettings } from './shared/storage';
import { sync } from './shared/sync';
import { reloadIfPending, setupUpdates } from './shared/update';
import { weekKey } from './shared/week';
import { renderArea, renderDashboard } from './views';

const app = document.getElementById('app')!;
const settings = loadSettings();
const sound = new Sound(settings.sound);
let cleanup: (() => void) | null = null;

// Ask the browser not to evict the progress when storage runs low.
void navigator.storage?.persist?.().catch(() => false);
listenForInstallPrompt();

/** True while an exercise runs: then neither updates nor server data may interrupt. */
let inModule = false;
setupUpdates(() => !inModule);
// A running exercise keeps its own state; server data waits until it is left.
sync.setApplyGuard(() => !inModule);

// Progress from the server replaces the local one: show it (only outside exercises).
sync.onRemoteData(() => {
  Object.assign(settings, loadSettings());
  if (!inModule) route();
});
window.addEventListener('online', () => {
  void sync.push().catch(() => undefined);
  void sync.flushPoints();
});

/** Routes: #/ (dashboard), #/<area>, #/<area>/<module>. */
function route(): void {
  cleanup?.();
  cleanup = null;
  app.removeAttribute('style');
  window.scrollTo(0, 0);
  inModule = false;
  void sync.applyDeferred();
  document.title = appTitle(sync.account()?.name);

  if (!sync.hasChosen()) {
    cleanup = renderLogin(app, () => {
      Object.assign(settings, loadSettings());
      sound.enabled = settings.sound;
      if (location.hash && location.hash !== '#/') location.hash = '#/';
      else route();
    });
    return;
  }
  reloadIfPending();

  const [areaId, moduleId] = location.hash.replace(/^#\/?/, '').split('/');
  if (areaId === DELETE_PROFILE_ROUTE) {
    renderDeleteProfile(app, () => {
      location.hash = '#/';
    });
    return;
  }
  // Old links before learning areas existed (#/uhr).
  const legacy = AREAS.find((a) => a.modules.some((m) => m.id === areaId));
  if (legacy) {
    location.replace(`#/${legacy.id}/${areaId}`);
    return;
  }

  const area = AREAS.find((a) => a.id === areaId && a.modules.length);
  if (!area) {
    cleanup = renderDashboard(app, route);
    // Catch up with changes from other devices when coming back to the overview.
    void sync.pull();
    return;
  }
  const module = area.modules.find((m) => m.id === moduleId);
  if (!module) {
    renderArea(app, area);
    return;
  }
  app.className = `module module-${module.id}`;
  inModule = true;
  cleanup = module.mount(app, {
    exit: () => {
      location.hash = `#/${area.id}`;
    },
    exitLabel: `Zur ${area.title}-Auswahl`,
    settings,
    saveSettings: () => saveSettings(settings),
    sound,
    addPoints: (points) => sync.addPoints(points, weekKey(Date.now())),
  });
}

window.addEventListener('hashchange', route);
// The list of recorded sentences, before the first explanation is read.
prepareSpeech();
route();
