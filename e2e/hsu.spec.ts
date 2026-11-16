import { expect, test, type Page } from '@playwright/test';

type Review = { stage: number; key: string; dueAt: number };

/**
 * Fresh device playing locally in an HSU quiz (`mod`: "tree" or "leaves").
 * With `reviews`, the given tasks come first and the stages up to the highest
 * one are open with all their steps (no guided examples).
 */
async function startQuiz(page: Page, mod: 'tree' | 'leaves', reviews: Review[] = []): Promise<void> {
  await page.goto('/');
  await page.evaluate(async ({ mod, reviews }) => {
    localStorage.clear();
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { freshProgress } = await load('/src/shared/quiz/engine.ts');
    const { QuizStore } = await load('/src/shared/quiz/storage.ts');
    const { sync } = await load('/src/shared/sync.ts');
    const exports = await load(`/src/modules/${mod}/course.ts`);
    const course = mod === 'tree' ? exports.treeCourse : exports.leavesCourse;
    const p = freshProgress(course, Date.now());
    if (reviews.length) {
      const top = Math.max(...reviews.map((r) => r.stage));
      p.stages.forEach((s: { unlocked: boolean; steps: number; mastery: number }, i: number) => {
        s.unlocked = i < top;
        // Loading caps it at the steps of the stage.
        s.steps = s.unlocked ? 9 : 0;
        s.mastery = 60;
      });
      p.forced = [];
      p.reviewQueue = reviews;
    }
    new QuizStore(course, course.storageKey).save(p);
    sync.playLocally();
  }, { mod, reviews });
  await page.goto(`/#/hsu/${mod === 'tree' ? 'baum' : 'laubbaeume'}`);
  await expect(page.locator('.quiz-card')).toBeVisible();
  // New answers ignore taps and keys for a moment (GameShell.holdAnswers).
  await expect(page.locator('.answers-held')).toHaveCount(0);
}

function option(page: Page, label: string) {
  return page.locator(`.quiz-answer[aria-label="${label}"]`);
}

test('the HSU area offers "Der Baum" and "Laubbäume"', async ({ page }) => {
  await startQuiz(page, 'tree');
  await page.goto('/#/hsu');
  await expect(page.locator('.module-title')).toHaveText(['Der Baum', 'Laubbäume']);
  await page.locator('.module-tile', { hasText: 'Laubbäume' }).click();
  await expect(page.locator('.leaves-card .leaf-svg')).toBeVisible();
});

test('Der Baum starts with the roots: the marked part, only explained names, the right one lights up', async ({ page }) => {
  await startQuiz(page, 'tree');
  await expect(page.locator('.message')).toHaveText('Die Wurzeln sind unter der Erde. Die richtige Antwort ist …');
  await expect(page.locator('.tree-svg')).toHaveAttribute('data-mark', 'wurzeln');
  // Nothing explained yet to compare with: one answer.
  await expect(page.locator('.quiz-answer')).toHaveCount(1);
  await expect(page.locator('.quiz-answer.suggested')).toHaveAttribute('aria-label', 'die Wurzeln', { timeout: 10_000 });
  await page.locator('.quiz-answer.suggested').click();
  await expect(page.locator('.message')).toHaveText('Genau! Das sind die Wurzeln.');
  await expect(page.locator('.quiz-show')).toHaveAttribute('aria-label', 'Ein Baum, markiert: die Wurzeln');
  // The next example offers the roots, explained now, next to the trunk.
  await expect(page.locator('.quiz-answer')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.tree-svg')).toHaveAttribute('data-mark', 'stamm');
  await expect(option(page, 'die Wurzeln')).toHaveCount(1);
});

test('Der Baum, stage 2: the tree shows no part while asked; a wrong part is explained', async ({ page }) => {
  await startQuiz(page, 'tree', [{ stage: 2, key: 's2', dueAt: 0 }]);
  await expect(page.locator('.message')).toHaveText('Welcher Teil leitet die Nährstoffe weiter?');
  await expect(page.locator('.tree-svg')).not.toHaveAttribute('data-mark', /./);
  await expect(option(page, 'die Wurzeln')).toHaveCount(1);
  await option(page, 'die Wurzeln').click();
  await expect(page.locator('.message')).toHaveText(
    'Die Wurzeln nehmen Wasser und Nährstoffe aus dem Boden auf. Der Stamm leitet die Nährstoffe weiter.',
  );
  await expect(option(page, 'der Stamm')).toHaveClass(/correct/);
  await expect(page.locator('.tree-svg')).toHaveAttribute('data-mark', 'stamm');
  await page.locator('.next').click();
  await expect(page.locator('.next')).toBeHidden();
});

test('Der Baum, stage 3: help takes one wrong answer away, and the answer counts with help', async ({ page }) => {
  await startQuiz(page, 'tree', [{ stage: 3, key: 'r1', dueAt: 0 }]);
  await expect(page.locator('.message')).toHaveText('Welche Aufgabe hat dieser Teil?');
  await expect(page.locator('.quiz-show')).toHaveAttribute('aria-label', 'Ein Baum, markiert: die Rinde');
  await page.getByRole('button', { name: 'Hilfe' }).click();
  await expect(page.locator('.message')).toHaveText('Welche Aufgabe hat dieser Teil? Eine falsche Antwort ist schon weg.');
  await expect(page.locator('.quiz-answer:disabled')).toHaveCount(1);
  await option(page, 'den Stamm schützen').click();
  await expect(page.locator('.message')).toHaveText('Gemeinsam geschafft! Die Rinde schützt den Stamm.');
});

test('Laubbäume: the linden leaf stands next to an explained look-alike; help says how to tell it', async ({ page }) => {
  await startQuiz(page, 'leaves', [{ stage: 1, key: 'linde', dueAt: 0 }]);
  await expect(page.locator('.message')).toHaveText('Von welchem Baum ist dieses Blatt?');
  await expect(page.locator('.quiz-show')).toHaveAttribute('aria-label', 'Ein Blatt');
  await expect(page.locator('.quiz-answer[aria-label="die Birke"], .quiz-answer[aria-label="die Buche"]')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Hilfe' }).click();
  await expect(page.locator('.message')).toHaveText('Das Blatt sieht aus wie ein Herz: die Linde.');
  await option(page, 'die Linde').click();
  await expect(page.locator('.message')).toHaveText('Gemeinsam geschafft! Das ist ein Blatt von der Linde.');
});

test('Laubbäume, stage 2: a fruit mixed up is explained', async ({ page }) => {
  await startQuiz(page, 'leaves', [{ stage: 2, key: 'buche', dueAt: 0 }]);
  await expect(page.locator('.message')).toHaveText('Von welchem Baum ist diese Frucht?');
  await expect(page.locator('.fruit-svg')).toBeVisible();
  await option(page, 'die Kastanie').click();
  await expect(page.locator('.message')).toHaveText(
    'Grüne, stachelige Hülle, darin eine braune, glänzende Kastanie. Bucheckern sind braun und haben drei Kanten: die Buche.',
  );
});
