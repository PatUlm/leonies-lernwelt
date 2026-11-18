import { expect, test, type Page } from '@playwright/test';
import { recordSpeech } from './helpers';

type Review = { stage: number; key: string; dueAt: number };

/**
 * Fresh device playing locally in an HSU quiz.
 * With `reviews`, the given tasks come first and the stages up to the highest
 * one are open with all their steps (no guided examples).
 */
const COURSES = {
  tree: { file: 'tree', name: 'treeCourse', route: 'baum' },
  leaves: { file: 'leaves', name: 'leavesCourse', route: 'laubbaeume' },
  rules: { file: 'forestrules', name: 'forestRulesCourse', route: 'waldregeln' },
} as const;

async function startQuiz(page: Page, mod: keyof typeof COURSES, reviews: Review[] = []): Promise<void> {
  await page.goto('/');
  const course = COURSES[mod];
  await page.evaluate(async ({ course, reviews }) => {
    localStorage.clear();
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { freshProgress } = await load('/src/shared/quiz/engine.ts');
    const { QuizStore } = await load('/src/shared/quiz/storage.ts');
    const { sync } = await load('/src/shared/sync.ts');
    const quiz = (await load(`/src/modules/${course.file}/course.ts`))[course.name];
    const p = freshProgress(quiz, Date.now());
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
    new QuizStore(quiz, quiz.storageKey).save(p);
    sync.playLocally();
  }, { course, reviews });
  await page.goto(`/#/hsu/${course.route}`);
  await expect(page.locator('.quiz-card')).toBeVisible();
  // New answers ignore taps and keys for a moment (GameShell.holdAnswers).
  await expect(page.locator('.answers-held')).toHaveCount(0);
}

function option(page: Page, label: string) {
  return page.locator(`.quiz-answer[aria-label="${label}"]`);
}

test('the HSU area offers "Der Baum", "Laubbäume" and "Waldregeln"', async ({ page }) => {
  await startQuiz(page, 'tree');
  await page.goto('/#/hsu');
  await expect(page.locator('.module-title')).toHaveText(['Der Baum', 'Laubbäume', 'Waldregeln']);
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

test('Waldregeln starts with the path: a scene, one rule card, the right one lights up', async ({ page }) => {
  await startQuiz(page, 'rules');
  await expect(page.locator('.rules-card .scene-svg')).toBeVisible();
  await expect(page.locator('.message')).toHaveText('Das Kind läuft nur auf dem Weg. Die richtige Antwort ist …');
  await expect(page.locator('.quiz-answer')).toHaveCount(1);
  await expect(page.locator('.quiz-answer.suggested')).toHaveAttribute('aria-label', 'Ich bleibe auf dem Weg.', { timeout: 10_000 });
  await page.locator('.quiz-answer.suggested').click();
  await expect(page.locator('.message')).toHaveText('Genau! Neben dem Weg wachsen junge Pflanzen und wohnen Tiere.');
});

test('Waldregeln, stage 2: a statement on the sign, "Richtig" left; a mistake says why and shows how it is done right', async ({ page }) => {
  await startQuiz(page, 'rules', [{ stage: 2, key: 'schreien', dueAt: 0 }]);
  await expect(page.locator('.rule-sign')).toHaveText('Im Wald darfst du laut schreien.');
  await expect(page.locator('.message')).toHaveText('Ist das im Wald richtig oder falsch?');
  await expect(page.locator('.quiz-answer')).toHaveText(['✓ Richtig', '✗ Falsch']);
  await expect(page.locator('.rule-statement .scene-svg')).toHaveCount(0);
  await option(page, 'Richtig').click();
  await expect(page.locator('.message')).toHaveText('Das ist im Wald falsch. Lärm erschreckt die Tiere.');
  await expect(option(page, 'Falsch')).toHaveClass(/correct/);
  await expect(page.locator('.rule-statement .scene-svg')).toBeVisible();
});

test('Waldregeln, stage 2: a wrong statement judged right is praised without "Richtig!"', async ({ page }) => {
  await startQuiz(page, 'rules', [{ stage: 2, key: 'pilze', dueAt: 0 }]);
  await option(page, 'Falsch').click();
  await expect(page.locator('.message')).toHaveText('Genau! Manche Pilze und Beeren sind giftig.');
  // No rule of the six behind it: the sign stays alone.
  await expect(page.locator('.rule-statement .scene-svg')).toHaveCount(0);
});

test('Waldregeln, stage 2: the speaker reads the statement on the sign, also after the help', async ({ page }) => {
  await recordSpeech(page);
  await startQuiz(page, 'rules', [{ stage: 2, key: 'feuer', dueAt: 0 }]);
  const spoken = () => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(' '));
  await page.getByRole('button', { name: 'Vorlesen' }).click();
  await expect.poll(spoken).toContain('Im Wald darfst du Feuer machen. Ist das im Wald richtig oder falsch?');
  await page.evaluate(() => ((window as unknown as { __spoken: string[] }).__spoken.length = 0));
  await page.getByRole('button', { name: 'Hilfe' }).click();
  await expect(page.locator('.message')).toHaveText('Ein Feuer kann den ganzen Wald anzünden.');
  await page.evaluate(() => ((window as unknown as { __spoken: string[] }).__spoken.length = 0));
  await page.getByRole('button', { name: 'Vorlesen' }).click();
  await expect.poll(spoken).toContain('Im Wald darfst du Feuer machen.');
  await expect.poll(spoken).toContain('Ein Feuer kann den ganzen Wald anzünden.');
});
