import { expect, test, type Page } from '@playwright/test';
import { finishSpeech, holdSpeech } from './helpers';

type Review = { stage: number; key: string; dueAt: number };

/**
 * Fresh device playing locally. With `reviews`, the given items come first and
 * the stages up to the highest one are open (no guided examples).
 */
async function startArticles(page: Page, reviews: Review[] = []): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (reviews) => {
    localStorage.clear();
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { freshProgress } = await load('/src/modules/articles/engine.ts');
    const { saveProgress } = await load('/src/modules/articles/storage.ts');
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
  await page.goto('/#/deutsch/artikel');
  await expect(page.locator('.answer').first()).toBeEnabled();
}

test('the Deutsch area offers "Der, die, das"', async ({ page }) => {
  await startArticles(page);
  await page.goto('/#/deutsch');
  await expect(page.locator('.module-title')).toHaveText('Der, die, das');
  await page.locator('.module-tile').click();
  await expect(page.locator('.word-card')).toBeVisible();
});

test('guided examples, then a mistake shows the right article in the gap', async ({ page }) => {
  await startArticles(page);
  for (let i = 0; i < 2; i++) {
    await expect(page.locator('.message')).toContainText('Schau mal');
    await page.locator('.answer.suggested').click();
    await expect(page.locator('.message')).toContainText('Genau!');
    await expect(page.locator('.answer.correct')).toHaveCount(0, { timeout: 10_000 });
  }

  await expect(page.locator('.message')).toHaveText('Welcher Artikel passt?');
  await expect(page.locator('.answer')).toHaveText(['der', 'die', 'das']);
  await expect(page.locator('.gap')).toHaveText('___');
  const word = (await page.locator('.word-line').textContent())!.replace('___', '').trim();

  // Pick a wrong one: the gap shows the right article, "Weiter" waits for her.
  const right = await page.evaluate(async (w) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { NOUNS } = await load('/src/modules/articles/words.ts');
    return NOUNS.find((n: { word: string }) => n.word === w).article as string;
  }, word);
  const wrong = ['der', 'die', 'das'].find((a) => a !== right)!;
  await page.locator('.answer', { hasText: new RegExp(`^${wrong}$`) }).click();
  await expect(page.locator('.message')).toContainText(`Schauen wir zusammen. Es heißt ${right} ${word}.`);
  await expect(page.locator('.gap.filled')).toHaveText(right);
  await expect(page.locator('.answer.wrong')).toHaveText(wrong);
  await page.locator('.next').click();
  await expect(page.locator('.answer.wrong')).toHaveCount(0);
  await expect(page.locator('.round-label')).toHaveText('1 / 10 Aufgaben');
});

test('a sentence: the words are the buttons, in capitals', async ({ page }) => {
  await startArticles(page, [{ stage: 3, key: 's:0', dueAt: 0 }]);
  await expect(page.locator('.message')).toHaveText('Tippe auf das Nomen.');
  await expect(page.locator('.word-card .word-chip')).toHaveText(['DIE', 'WOLKE', 'IST', 'SEHR', 'DUNKEL']);
  await page.locator('.word-chip', { hasText: 'WOLKE' }).click();
  await expect(page.locator('.message')).toContainText('Richtig! Die Wolke – WOLKE ist das Nomen.');
});

test('a story: the known thing takes der, buttons and gap are capitalised at the start', async ({ page }) => {
  await startArticles(page, [{ stage: 4, key: 't:known:Ball:1:0', dueAt: 0 }]);
  await expect(page.locator('.story-line')).toHaveText(['Hier ist ein Ball zu sehen.', '___ Ball gefällt mir.']);
  await expect(page.locator('.story-emoji')).toHaveText(['⚽', '⚽']);
  await expect(page.locator('.answer')).toHaveText(['Der', 'Ein']);
  await page.locator('.answer', { hasText: 'Der' }).click();
  await expect(page.locator('.story-line').nth(1)).toHaveText('Der Ball gefällt mir.');
  await expect(page.locator('.message')).toContainText('Es ist noch derselbe Ball.');
});

test('a story: a second thing joins with eine, in the middle of the sentence', async ({ page }) => {
  await startArticles(page, [{ stage: 4, key: 't:new:Katze:3:3:Hund', dueAt: 0 }]);
  await expect(page.locator('.story-line')).toHaveText(['Ein Hund ist auf dem Bild.', 'Außerdem ist ___ Katze auf dem Bild.']);
  await expect(page.locator('.story-emoji')).toHaveText(['🐶', '🐱']);
  await expect(page.locator('.answer')).toHaveText(['die', 'eine']);
  await page.locator('.answer', { hasText: 'eine' }).click();
  await expect(page.locator('.story-line').nth(1)).toHaveText('Außerdem ist eine Katze auf dem Bild.');
  await expect(page.locator('.message')).toContainText('Zuerst war ein Hund da. Jetzt kommt eine Katze dazu.');
});

test('after a right answer, the next task waits until the explanation has been read aloud', async ({ page }) => {
  await holdSpeech(page);
  await page.clock.install();
  await startArticles(page);
  await page.locator('.answer.suggested').click();
  await expect(page.locator('.message')).toContainText('Genau!');
  await page.locator('[data-ref="speak"]').click();
  // Well past the usual 1.5 s: still the explanation.
  await page.clock.runFor(5000);
  await expect(page.locator('.message')).toContainText('Genau!');
  await finishSpeech(page);
  await expect(page.locator('.message')).toContainText('Schau mal');
});

test('speech that never reports its end holds the next task for 30 seconds at most', async ({ page }) => {
  await holdSpeech(page);
  await page.clock.install();
  await startArticles(page);
  await page.locator('.answer.suggested').click();
  await page.locator('[data-ref="speak"]').click();
  await page.clock.runFor(25_000);
  await expect(page.locator('.message')).toContainText('Genau!');
  await page.clock.runFor(10_000);
  await expect(page.locator('.message')).toContainText('Schau mal');
});

test('the card, the question and all answers fit on the screen', async ({ page }) => {
  // The longest story: two long nouns in long sentences.
  await startArticles(page, [{ stage: 4, key: 't:new:Schlüssel:1:4:Fahrrad', dueAt: 0 }]);
  const viewport = page.viewportSize()!;
  for (const selector of ['.word-card', '.message', '.answer']) {
    for (const box of await page.locator(selector).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
      expect(box.left, selector).toBeGreaterThanOrEqual(0);
      expect(box.right, selector).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box.bottom, selector).toBeLessThanOrEqual(viewport.height + 0.5);
    }
  }
});
