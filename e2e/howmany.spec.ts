import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

type Review = { stage: number; key: string; dueAt: number };

/**
 * Fresh device playing locally. With `reviews`, the given pictures come first
 * and the stages up to the highest one are open (no guided examples).
 */
async function startHowMany(page: Page, reviews: Review[] = []): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (reviews) => {
    localStorage.clear();
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { freshProgress } = await load('/src/modules/howmany/engine.ts');
    const { saveProgress } = await load('/src/modules/howmany/storage.ts');
    const { sync } = await load('/src/shared/sync.ts');
    const p = freshProgress(Date.now());
    if (reviews.length) {
      const top = Math.max(...reviews.map((r) => r.stage));
      p.stages.forEach((s: { unlocked: boolean }, i: number) => (s.unlocked = i < top));
      p.forced = [];
      p.reviewQueue = reviews;
    }
    saveProgress(p);
    sync.playLocally();
  }, reviews);
  await page.goto('/#/englisch/howmany');
  await expect(page.locator('.count-card')).toBeVisible();
}

function card(page: Page, word: string) {
  return page.locator('.build-card:not(.used)', { hasText: new RegExp(`^${word}$`) });
}

/** Taps the cards in this order. */
async function build(page: Page, words: string[]): Promise<void> {
  for (const word of words) await card(page, word).click();
}

test('the Englisch area offers "How many?" next to the words', async ({ page }) => {
  await startHowMany(page);
  await page.goto('/#/englisch');
  await expect(page.locator('.module-title')).toHaveText(['Farben, Zahlen, Tiere', 'How many?']);
  await page.locator('.module-tile', { hasText: 'How many?' }).click();
  await expect(page.locator('.count-question')).toHaveText('How many ghosts are there?');
});

test('a guided example: one ghost, the cards light up one after the other', async ({ page }) => {
  await startHowMany(page);
  await expect(page.locator('.message')).toHaveText(
    'Hier ist nur ein Geist. Dann sagt man: There is one ghost. Bei einem bleibt das s weg. Tippe die Kärtchen an, die leuchten.',
  );
  await expect(page.locator('.count-thing')).toHaveCount(1);
  await expect(page.locator('.build-card')).toHaveCount(5);
  await expect(page.locator('.check')).toBeHidden();
  for (const word of ['there', 'is', 'one', 'ghost']) {
    await expect(page.locator('.build-card.suggested')).toHaveText(word, { timeout: 10_000 });
    await page.locator('.build-card.suggested').click();
  }
  await expect(page.locator('.message')).toHaveText('Genau! There is one ghost.');
  await expect(page.locator('.build-slot.ok')).toHaveText(['There', 'is', 'one', 'ghost']);
});

test('the question is asked with the recording of the sentence', async ({ page }) => {
  // The test API reads its recordings from .data/e2e/tts (playwright.config.ts).
  const dir = join('.data', 'e2e', 'tts', 'en');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'how-many-cats-are-there.mp3'), 'mp3:question');
  const asked = page.waitForResponse((r) => r.url().includes('/api/tts?lang=en&word=How%20many%20cats%20are%20there%3F'));
  await startHowMany(page, [{ stage: 1, key: 'cat:2', dueAt: 0 }]);
  // The audio element asks for byte ranges.
  expect([200, 206]).toContain((await asked).status());
  await expect(page.locator('.message')).toHaveText('Bau die Antwort mit den Kärtchen.');
});

test('the keyboard focus moves on to the next free card', async ({ page }) => {
  await startHowMany(page, [{ stage: 1, key: 'dog:2', dueAt: 0 }]);
  // New cards ignore taps and keys for a moment (GameShell.holdAnswers).
  await expect(page.locator('.answers-held')).toHaveCount(0);
  await card(page, 'there').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.build-slot').first()).toHaveText('There');
  await expect(page.locator('.build-card:focus')).toHaveCount(1);
  for (const word of ['are', 'two', 'dogs']) await card(page, word).click();
  await expect(page.locator('.check')).toBeFocused();
});

test('a wrong "s": the right cards stay, the hint asks one or several, then it is solved together', async ({ page }) => {
  await startHowMany(page, [{ stage: 1, key: 'ghost:1', dueAt: 0 }]);
  await expect(page.locator('.count-thing')).toHaveCount(1);
  await expect(page.locator('.check')).toBeDisabled();
  await build(page, ['there', 'is', 'one', 'ghosts']);
  await expect(page.locator('.build-slot')).toHaveText(['There', 'is', 'one', 'ghosts']);
  await page.locator('.check').click();
  await expect(page.locator('.message')).toHaveText('Eins oder mehrere? Bei einem bleibt das s weg, bei mehreren kommt ein s dazu.');
  await expect(page.locator('.build-slot.ok')).toHaveText(['There', 'is', 'one']);
  await expect(page.locator('.build-slot.wrong')).toHaveText('');
  await build(page, ['ghost']);
  await page.locator('.check').click();
  await expect(page.locator('.message')).toHaveText('Gemeinsam geschafft! There is one ghost.');
});

test('a card in the sentence goes back when tapped', async ({ page }) => {
  await startHowMany(page, [{ stage: 2, key: 'dog:3', dueAt: 0 }]);
  await expect(page.locator('.build-card')).toHaveCount(6);
  await build(page, ['there', 'is']);
  await page.locator('.build-slot', { hasText: /^is$/ }).click();
  await build(page, ['are', 'three', 'dogs']);
  await page.locator('.check').click();
  await expect(page.locator('.message')).toHaveText('Richtig! There are three dogs.');
});

test('two wrong checks: the sentence is shown and "Weiter" goes on', async ({ page }) => {
  await startHowMany(page, [{ stage: 3, key: 'cat:4', dueAt: 0 }]);
  await expect(page.locator('.build-card')).toHaveCount(7);
  const wrongNumber = (await page.locator('.build-card').allTextContents()).find((w) => ['three', 'five'].includes(w))!;
  await build(page, ['there', 'are', wrongNumber, 'cats']);
  await page.locator('.check').click();
  await expect(page.locator('.message')).toHaveText('Zähle noch einmal genau.');
  await build(page, ['four']);
  await page.locator('.build-slot', { hasText: /^four$/ }).click();
  await build(page, [wrongNumber]);
  await page.locator('.check').click();
  await expect(page.locator('.message')).toHaveText('Schauen wir zusammen: There are four cats.');
  await expect(page.locator('.build-slot.shown')).toHaveText(['There', 'are', 'four', 'cats']);
  await page.locator('.next').click();
  await expect(page.locator('.message')).toHaveText('Gemeinsam geschafft! There are four cats.');
});

test('help clears the first wrong place and lights up its card', async ({ page }) => {
  await startHowMany(page, [{ stage: 2, key: 'ghost:2', dueAt: 0 }]);
  await build(page, ['there', 'is']);
  await page.locator('[aria-label="Hilfe"]').click();
  await expect(page.locator('.message')).toHaveText('Es sind mehrere: Dann heißt es „are“.');
  await expect(page.locator('.build-slot')).toHaveText(['There', '', '', '']);
  await expect(page.locator('.build-card.suggested')).toHaveText('are');
  await build(page, ['are', 'two', 'ghosts']);
  await page.locator('.check').click();
  await expect(page.locator('.message')).toHaveText('Gemeinsam geschafft! There are two ghosts.');
});
