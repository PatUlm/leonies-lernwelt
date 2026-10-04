import { registerSW } from 'virtual:pwa-register';

/**
 * Updates of the installed app: the service worker looks for a new version on
 * start, every 30 minutes and whenever the app comes back to the foreground.
 * A new version takes over by itself; the page reloads into it as soon as no
 * exercise is running (never in the middle of a task).
 */
let registration: ServiceWorkerRegistration | undefined;
let reloadPending = false;
let isSafe: () => boolean = () => true;

export function setupUpdates(safeToReload: () => boolean): void {
  isSafe = safeToReload;
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    // Without this hook autoUpdate reloads every open page at once, exercises included.
    // It is not called for the very first install.
    onNeedReload() {
      reloadPending = true;
      reloadIfPending();
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (!reg) return;
      setInterval(() => void reg.update(), 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void reg.update();
      });
    },
  });
}

/** Call when the app reaches a calm moment (e.g. back on the dashboard). */
export function reloadIfPending(): void {
  if (reloadPending && isSafe()) location.reload();
}

export async function checkForUpdate(): Promise<void> {
  await registration?.update();
}

export const APP_VERSION = __APP_VERSION__;
