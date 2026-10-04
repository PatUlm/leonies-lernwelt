import '@fontsource-variable/fredoka';
import './style.css';
import { AREAS } from './areas';
import { APP_NAME } from './config';
import { Sound } from './shared/sound';
import { listenForInstallPrompt } from './shared/install';
import { loadSettings, saveSettings } from './shared/storage';
import { renderArea, renderDashboard } from './views';

const app = document.getElementById('app')!;
const settings = loadSettings();
const sound = new Sound(settings.sound);
let cleanup: (() => void) | null = null;

document.title = APP_NAME;

// Ask the browser not to evict the progress when storage runs low.
void navigator.storage?.persist?.().catch(() => false);
listenForInstallPrompt();

/** Routes: #/ (dashboard), #/<area>, #/<area>/<module>. */
function route(): void {
  cleanup?.();
  cleanup = null;
  app.removeAttribute('style');
  window.scrollTo(0, 0);

  const [areaId, moduleId] = location.hash.replace(/^#\/?/, '').split('/');
  // Old links before learning areas existed (#/uhr).
  const legacy = AREAS.find((a) => a.modules.some((m) => m.id === areaId));
  if (legacy) {
    location.replace(`#/${legacy.id}/${areaId}`);
    return;
  }

  const area = AREAS.find((a) => a.id === areaId && a.modules.length);
  if (!area) {
    cleanup = renderDashboard(app);
    return;
  }
  const module = area.modules.find((m) => m.id === moduleId);
  if (!module) {
    renderArea(app, area);
    return;
  }
  app.className = `module module-${module.id}`;
  cleanup = module.mount(app, {
    exit: () => {
      location.hash = `#/${area.id}`;
    },
    exitLabel: `Zur ${area.title}-Auswahl`,
    settings,
    saveSettings: () => saveSettings(settings),
    sound,
  });
}

window.addEventListener('hashchange', route);
route();
