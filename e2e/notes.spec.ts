import { expect, test, type Page } from '@playwright/test';

type Review = { stage: number; key: string; dueAt: number };

/**
 * Fresh device playing locally. With `reviews`, the given tasks come first and
 * the stages up to the highest one are open (no guided examples); `mastery`
 * puts every open stage past its start (no fields, any gap).
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
      p.stages.forEach((s: { unlocked: boolean; mastery: number }, i: number) => {
        s.unlocked = i < top;
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

test('stage 1 starts with the quarter note: one beat lights up', async ({ page }) => {
  await startNotes(page);
  await expect(page.locator('.message')).toHaveText(
    'Ausgemalt, mit Hals, ohne Fähnchen: Das ist eine Viertelnote. Die Viertelnote dauert einen Schlag. Ein Feld ist ein Schlag. Die richtige Antwort ist …',
  );
  await expect(page.locator('.notes-answer')).toHaveCount(3);
  await expect(page.locator('.notes-answer.suggested')).toHaveAttribute('aria-label', '1 Schlag', { timeout: 10_000 });
  await page.locator('.notes-answer.suggested').click();
  await expect(page.locator('.message')).toHaveText('Genau! Die Viertelnote dauert einen Schlag.');
  await expect(page.locator('.notes-answer.correct')).toHaveAttribute('aria-label', '1 Schlag');
});

test('stage 3: a wrong note is explained, "Weiter" goes on', async ({ page }) => {
  await startNotes(page, [{ stage: 3, key: 'h', dueAt: 0 }]);
  await expect(page.locator('.message')).toHaveText('Welche Note dauert so lange?');
  await expect(page.locator('.notes-card .length-label')).toHaveText('2 Schläge');
  const wrong = page.locator('.notes-answer:not([aria-label="halbe Note"])').first();
  const name = await wrong.getAttribute('aria-label');
  await wrong.click();
  const rules: Record<string, string> = {
    Achtelnote: 'Die Achtelnote dauert einen halben Schlag.',
    Viertelnote: 'Die Viertelnote dauert einen Schlag.',
    'ganze Note': 'Die ganze Note dauert vier Schläge.',
  };
  await expect(page.locator('.message')).toHaveText(`Schauen wir zusammen. ${rules[name!]} Die halbe Note dauert zwei Schläge.`);
  await expect(option(page, 'halbe Note')).toHaveClass(/correct/);
  await expect(page.locator('.notes-answer.wrong')).toHaveCount(1);
  await page.locator('.next').click();
  await expect(page.locator('.next')).toBeHidden();
  await expect(page.locator('.notes-answer.correct')).toHaveCount(0);
});

test('stage 2: help puts the fields under the groups', async ({ page }) => {
  await startNotes(page, [{ stage: 2, key: 'h:eeq', dueAt: 0 }], 60);
  await expect(page.locator('.message')).toHaveText('Welche Noten dauern zusammen genauso lang?');
  await expect(page.locator('.notes-answer .field')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hilfe' }).click();
  await expect(page.locator('.message')).toHaveText('Zähle bei jeder Gruppe die Schläge zusammen. Die Felder helfen dir.');
  await expect(page.locator('.notes-answer .field').first()).toBeVisible();
  await option(page, 'Achtelnote, Achtelnote, Viertelnote').click();
  await expect(page.locator('.message')).toHaveText('Gemeinsam geschafft! Zusammen dauern sie zwei Schläge, genau wie die halbe Note.');
});

test('"Anhören" after the answer is heard to the end before the next task', async ({ page }) => {
  await startNotes(page, [{ stage: 3, key: 'w', dueAt: 0 }]);
  await option(page, 'ganze Note').click();
  await page.locator('.notes-card .listen-button').click();
  // Two clicks to count in and four beats take about 5 s; the next task waits.
  await page.waitForTimeout(3000);
  await expect(page.locator('.notes-answer.correct')).toHaveCount(1);
  await expect(page.locator('.notes-answer.correct')).toHaveCount(0, { timeout: 8000 });
});

test('stage 4: the right note fills the bar', async ({ page }) => {
  await startNotes(page, [{ stage: 4, key: 'h_q', dueAt: 0 }], 60);
  await expect(page.locator('.message')).toHaveText('Welche Note fehlt im Takt?');
  await expect(page.locator('.notes-card .gap-box')).toHaveCount(1);
  await expect(page.locator('.notes-show')).toHaveAttribute('aria-label', '4/4-Takt: Halbe Note, Lücke, Viertelnote');
  await option(page, 'Viertelnote').click();
  await expect(page.locator('.message')).toHaveText('Richtig! Es fehlt ein Schlag: die Viertelnote. Jetzt ist der Takt voll.');
  await expect(page.locator('.notes-card .gap-box')).toHaveCount(0);
  await expect(page.locator('.notes-card .note')).toHaveCount(3);
});
