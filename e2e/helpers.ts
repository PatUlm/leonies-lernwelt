import { expect, type Page } from '@playwright/test';

export type ForcedTask = { type: 'example'; track: string; tier: number } | { type: 'easy' };

/**
 * Fresh device with a clock progress whose first tasks are `forced`
 * (default: the two guided examples a new player gets). With `profile` the
 * device signs up, otherwise it plays on this device only.
 */
export async function startDevice(page: Page, options: { forced?: ForcedTask[]; profile?: string } = {}): Promise<void> {
  await page.goto('/');
  await page.evaluate(async ({ forced, profile }) => {
    localStorage.clear();
    // Modules of the Vite dev server, loaded inside the page (paths kept out of tsc's reach).
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { freshProgress } = await load('/src/modules/clock/engine.ts');
    const { saveProgress } = await load('/src/modules/clock/storage.ts');
    const { sync } = await load('/src/shared/sync.ts');
    const p = freshProgress(Date.now());
    if (forced) p.forced = forced;
    saveProgress(p);
    if (profile) await sync.signup(profile, '1234');
    else sync.playLocally();
  }, options);
}

export async function openClock(page: Page): Promise<void> {
  await page.goto('/#/mathe/uhr');
  await expect(page.locator('.answer').first()).toBeEnabled();
}

/** Waits until the next task is shown (answers enabled, no feedback marks left). */
export async function nextTaskShown(page: Page): Promise<void> {
  await expect(page.locator('.answer.correct')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.answer').first()).toBeEnabled();
}

/** Replaces speech synthesis with a recorder: window.__spoken lists every text spoken. */
export async function recordSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.assign(window, { __spoken: spoken });
    const synth = {
      speak(u: SpeechSynthesisUtterance) {
        spoken.push(u.text);
        setTimeout(() => {
          u.onstart?.(new Event('start') as SpeechSynthesisEvent);
          u.onend?.(new Event('end') as SpeechSynthesisEvent);
        }, 0);
      },
      cancel() {},
      getVoices: () => [],
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  });
}
