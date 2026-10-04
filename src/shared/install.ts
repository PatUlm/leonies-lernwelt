/**
 * "Als App installieren": Chrome on Android offers installing a PWA through the
 * beforeinstallprompt event. It may fire before the dashboard is shown, so it is
 * captured at startup and kept until used.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

/** True when the browser offers installing and the app is not running installed. */
export function canInstall(): boolean {
  return deferred !== null && !window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
}

export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null;
  await event.prompt();
  await event.userChoice.catch(() => undefined);
  listeners.forEach((l) => l());
}

/** Calls `fn` whenever installability changes; returns an unsubscribe function. */
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
