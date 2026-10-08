import { expect, test, type Page } from '@playwright/test';
import { nextTaskShown, openClock, recordSpeech, startDevice } from './helpers';

/** Afternoon learnt, times of day mixed in; the first task is a reading of 3:45 in the afternoon. */
async function startMixed(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { freshProgress } = await load('/src/modules/clock/engine.ts');
    const { saveProgress } = await load('/src/modules/clock/storage.ts');
    const { sync } = await load('/src/shared/sync.ts');
    const p = freshProgress(Date.now());
    p.forced = [];
    for (const track of ['digital', 'daytime']) {
      for (const tier of [1, 2, 3]) Object.assign(p.tracks[track][tier - 1], { unlocked: true, ready: true, mastery: 60 });
    }
    p.dayMix = { phase: 'transfer', since: 1, recent: [] };
    p.reviewQueue = [{ track: 'digital', hour: 3, minute: 45, context: 'afternoon', dueAt: 0 }];
    saveProgress(p);
    sync.playLocally();
  });
}

test('reading the clock with a time of day: 24-hour answers, and parents see the mix', async ({ page }) => {
  await startMixed(page);
  await openClock(page);
  await expect(page.locator('.message .context-line')).toHaveText('Es ist Nachmittag.');
  const labels = await page.locator('.answer').allTextContents();
  expect(labels).toContain('15:45 Uhr');
  expect(labels.every((l) => /^\d{1,2}:\d{2} Uhr$/.test(l))).toBe(true);
  await page.locator('.answer', { hasText: '15:45 Uhr' }).click();
  await expect(page.locator('.message')).toContainText('15:45 Uhr – Viertel vor vier am Nachmittag.');

  await page.getByRole('button', { name: 'Elternbereich' }).click();
  await expect(page.locator('.progress-table tr.group')).toHaveText('Uhrzeiten im Tageslauf');
  await expect(page.locator('.progress-table')).toContainText('24-Stunden-Zeiten lesen');
  await expect(page.locator('.legend').first()).toContainText('Beimischung in den übrigen Übungen');
  await expect(page.locator('.legend').first()).toContainText('Übergang');
});

test('the time of day stands right above the answers, through the feedback, and is read once', async ({ page }) => {
  await recordSpeech(page);
  await startDevice(page, { forced: [{ type: 'example', track: 'daytime', tier: 1 }] });
  await openClock(page);

  const picture = page.locator('.daytime');
  const sentence = page.locator('.message .context-line');
  await expect(picture).toBeVisible();
  await expect(sentence).toHaveText('Es ist Nachmittag.');

  // Right above the answers and beside the question, not at the edge of a wide screen.
  const box = (await picture.boundingBox())!;
  const answers = (await page.locator('.answers').boundingBox())!;
  const text = (await page.locator('.message-text').boundingBox())!;
  expect(answers.y - (box.y + box.height)).toBeLessThan(60);
  expect(box.y + box.height).toBeLessThanOrEqual(answers.y);
  expect(box.x).toBeGreaterThanOrEqual(answers.x);
  expect(text.x - (box.x + box.width)).toBeLessThan(30);

  // "15:00 Uhr" fits into its button and the buttons into the screen.
  const overflow = await page.locator('.answer').evaluateAll((buttons) =>
    buttons.filter((b) => b.scrollWidth > b.clientWidth || b.getBoundingClientRect().right > window.innerWidth).map((b) => b.textContent),
  );
  expect(overflow).toEqual([]);

  // The example is read at once, the time of day in front of it.
  const spoken = () => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  await expect.poll(spoken).toHaveLength(1);
  const [first] = await spoken();
  expect(first.match(/Es ist Nachmittag\./g)).toHaveLength(1);
  expect(first).toMatch(/^Es ist Nachmittag\. Das Bild zeigt die Tageszeit\..* Die richtige Antwort ist …$/);

  // Stays during the feedback ...
  await page.locator('.answer.suggested').click();
  await expect(picture).toBeVisible();
  await expect(sentence).toHaveText('Es ist Nachmittag.');

  // ... and is gone with the next task without a time of day.
  await nextTaskShown(page);
  await expect(picture).toBeHidden();
  await expect(sentence).toBeEmpty();
});
