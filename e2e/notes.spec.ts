import { expect, test, type Page } from '@playwright/test';

type Review = { stage: number; key: string; dueAt: number };

/**
 * Fresh device playing locally. With `reviews`, the given tasks come first and
 * the stages up to the highest one are open with all their notes (no guided
 * examples); `mastery` puts every open stage past its start (any gap).
 */
async function startNotes(page: Page, reviews: Review[] = [], mastery = 0): Promise<void> {
  await page.goto('/');
  await page.evaluate(async ({ reviews, mastery }) => {
    localStorage.clear();
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { freshProgress } = await load('/src/modules/notes/engine.ts');
    const { saveProgress } = await load('/src/modules/notes/storage.ts');
    const { sync } = await load('/src/shared/sync.ts');
    const p = freshProgress(Date.now());
    if (reviews.length) {
      const top = Math.max(...reviews.map((r) => r.stage));
      p.stages.forEach((s: { unlocked: boolean; steps: number; mastery: number }, i: number) => {
        s.unlocked = i < top;
        // Loading caps it at the steps of the stage.
        s.steps = s.unlocked ? 9 : 0;
        s.mastery = mastery;
      });
      p.forced = [];
      p.reviewQueue = reviews;
    }
    saveProgress(p);
    sync.playLocally();
  }, { reviews, mastery });
  await page.goto('/#/musik/noten');
  await expect(page.locator('.notes-card')).toBeVisible();
  // New answers ignore taps and keys for a moment (GameShell.holdAnswers).
  await expect(page.locator('.answers-held')).toHaveCount(0);
}

function option(page: Page, label: string) {
  return page.locator(`.notes-answer[aria-label="${label}"]`);
}

test('the Musik area offers "Notenwerte"', async ({ page }) => {
  await startNotes(page);
  await page.goto('/#/musik');
  await expect(page.locator('.module-title')).toHaveText(['Notenwerte']);
  await page.locator('.module-tile', { hasText: 'Notenwerte' }).click();
  await expect(page.locator('.notes-card')).toBeVisible();
});

test('stage 1 starts with the quarter note: one beat lights up, only explained lengths', async ({ page }) => {
  await startNotes(page);
  await expect(page.locator('.message')).toHaveText(
    'Ausgemalt, ohne Fähnchen: die Viertelnote. Die Viertelnote dauert einen Schlag. Die richtige Antwort ist …',
  );
  await expect(page.locator('.notes-answer')).toHaveCount(2);
  await expect(option(page, '2 Schläge')).toHaveCount(0);
  await expect(page.locator('.notes-answer.suggested')).toHaveAttribute('aria-label', '1 Schlag', { timeout: 10_000 });
  await page.locator('.notes-answer.suggested').click();
  await expect(page.locator('.message')).toHaveText('Genau! Die Viertelnote dauert einen Schlag.');
  await expect(page.locator('.notes-answer.correct')).toHaveAttribute('aria-label', '1 Schlag');
});

test('stage 2: a wrong note is explained, "Weiter" goes on', async ({ page }) => {
  await startNotes(page, [{ stage: 2, key: 'h', dueAt: 0 }]);
  await expect(page.locator('.message')).toHaveText('Welche Note dauert so lange?');
  await expect(page.locator('.notes-card .length-label')).toHaveText('2 Schläge');
  const wrong = page.locator('.notes-answer:not([aria-label="halbe Note"])').first();
  const name = await wrong.getAttribute('aria-label');
  await wrong.click();
  const rules: Record<string, string> = {
    Achtelnote: 'Die Achtelnote dauert einen halben Schlag.',
    Viertelnote: 'Die Viertelnote dauert einen Schlag.',
  };
  await expect(page.locator('.message')).toHaveText(`${rules[name!]} Die halbe Note dauert zwei Schläge.`);
  await expect(option(page, 'halbe Note')).toHaveClass(/correct/);
  await expect(page.locator('.notes-answer.wrong')).toHaveCount(1);
  await page.locator('.next').click();
  await expect(page.locator('.next')).toBeHidden();
  await expect(page.locator('.notes-answer.correct')).toHaveCount(0);
});

test('"Anhören" after the answer is heard to the end before the next task', async ({ page }) => {
  await startNotes(page, [{ stage: 2, key: 'h', dueAt: 0 }]);
  await option(page, 'halbe Note').click();
  await page.locator('.notes-card .listen-button').click();
  // Two clicks to count in and two beats take about 3 s; without waiting the next task would come after 1.8 s.
  await page.waitForTimeout(2500);
  await expect(page.locator('.notes-answer.correct')).toHaveCount(1);
  await expect(page.locator('.notes-answer.correct')).toHaveCount(0, { timeout: 8000 });
});

test('stage 3: the fields show the gap, help counts, the right note makes two beats', async ({ page }) => {
  await startNotes(page, [{ stage: 3, key: 'q_e', dueAt: 0 }], 60);
  await expect(page.locator('.message')).toHaveText('Welche Note fehlt für zwei Schläge?');
  await expect(page.locator('.notes-show')).toHaveAttribute('aria-label', 'Zwei Schläge: Viertelnote, Lücke, Achtelnote');
  await expect(page.locator('.notes-card .gap-box .empty-field')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hilfe' }).click();
  await expect(page.locator('.message')).toHaveText('Schau auf die Felder: Wie viel fehlt noch?');
  await option(page, 'Achtelnote').click();
  await expect(page.locator('.message')).toHaveText('Gemeinsam geschafft! Jetzt sind es zwei Schläge.');
  await expect(page.locator('.notes-card .gap-box')).toHaveCount(0);
  await expect(page.locator('.notes-card .note')).toHaveCount(3);
});

test('stage 3: two empty beats take the half note', async ({ page }) => {
  await startNotes(page, [{ stage: 3, key: '_', dueAt: 0 }], 60);
  await expect(page.locator('.notes-show')).toHaveAttribute('aria-label', 'Zwei Schläge: Lücke');
  await option(page, 'Viertelnote').click();
  await expect(page.locator('.message')).toHaveText('Damit sind die zwei Schläge noch nicht voll. Es fehlen zwei Schläge: die halbe Note.');
});
