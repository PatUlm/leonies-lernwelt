import { expect, test, type Page } from '@playwright/test';

type Review = { stage: number; key: string; dueAt: number };

/**
 * Fresh device playing locally. With `reviews`, the given problems come first
 * and the stages up to the highest one are open (no guided examples); `open`
 * opens stages without any examples shown.
 */
async function startInverse(page: Page, reviews: Review[] = [], open = 0): Promise<void> {
  await page.goto('/');
  await page.evaluate(async ({ reviews, open }) => {
    localStorage.clear();
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { freshProgress } = await load('/src/modules/inverse/engine.ts');
    const { saveProgress } = await load('/src/modules/inverse/storage.ts');
    const { sync } = await load('/src/shared/sync.ts');
    const p = freshProgress(Date.now());
    if (reviews.length) {
      const top = Math.max(...reviews.map((r) => r.stage));
      p.stages.forEach((s: { unlocked: boolean }, i: number) => (s.unlocked = i < top));
      p.forced = [];
      p.reviewQueue = reviews;
      Object.assign(p, { backShown: true, chooseShown: true, probeShown: true, hundredShown: true });
    }
    if (open) {
      p.stages.forEach((s: { unlocked: boolean }, i: number) => (s.unlocked = i < open));
      p.forced = [];
    }
    saveProgress(p);
    sync.playLocally();
  }, { reviews, open });
  await page.goto('/#/mathe/umkehr');
  await expect(page.locator('.calc-card')).toBeVisible();
}

/** Types a number on the pad and confirms it. */
async function enter(page: Page, n: number): Promise<void> {
  for (const d of String(n)) await page.locator('.key-digit', { hasText: new RegExp(`^${d}$`) }).click();
  await page.locator('.key-submit').click();
}

test('the Mathe area offers "Umkehraufgaben" next to the clock', async ({ page }) => {
  await startInverse(page);
  await page.goto('/#/mathe');
  await expect(page.locator('.module-title')).toHaveText(['Die Uhr', 'Umkehraufgaben']);
  await page.locator('.module-tile', { hasText: 'Umkehraufgaben' }).click();
  await expect(page.locator('.calc-card')).toBeVisible();
});

test('a guided example explains line by line: the numbers to type light up, then the gap is filled', async ({ page }) => {
  await startInverse(page);
  await expect(page.locator('.message')).toHaveText(
    'Die Umkehraufgabe rechnet rückwärts: 96 − 23. Zuerst die Zehner: 96 − 20 = 76. Tippe die Zahl ab, die leuchtet.',
  );
  await expect(page.locator('.calc-task .calc-eq')).toHaveText(/\+\s*23\s*=\s*96/);
  await expect(page.locator('.calc-inverse .calc-eq')).toHaveText('96 − 23');
  await expect(page.locator('.calc-field.active .ghost')).toHaveText('76', { timeout: 10_000 });
  await enter(page, 76);
  await expect(page.locator('.calc-step .calc-copy')).toHaveText('76');
  await expect(page.locator('.message')).toHaveText('Dann die Einer: 76 − 3 = 73. Tippe die Zahl ab, die leuchtet.');
  await expect(page.locator('.calc-field.active .ghost')).toHaveText('73', { timeout: 10_000 });
  await enter(page, 73);
  await expect(page.locator('.message')).toHaveText('Genau! 73 + 23 = 96.');
  await expect(page.locator('.calc-gap.filled')).toHaveText('73');
});

test('two lines: a wrong first try gets a hint, the second one shows the line', async ({ page }) => {
  await startInverse(page, [{ stage: 2, key: 'f:90:23', dueAt: 0 }]);
  await expect(page.locator('.message')).toHaveText('Ziehe zuerst die Zehner ab.');
  await expect(page.locator('.calc-step .calc-eq').first()).toHaveText(/^90 − 20 =/);

  // The ones first: the hint says step by step, the field stays open.
  await enter(page, 87);
  await expect(page.locator('.message')).toHaveText('Wir rechnen schrittweise: zuerst nur die Zehner, dann die Einer.');
  await expect(page.locator('.calc-field.wrong')).toHaveText('87');
  await enter(page, 70);
  await expect(page.locator('.calc-field.ok')).toHaveText('70');
  await expect(page.locator('.message')).toHaveText('Ziehe jetzt die Einer ab.');

  // Over the ten with the tens kept, twice: the line is shown, "Weiter" waits.
  await enter(page, 77);
  await expect(page.locator('.message')).toHaveText('Du gehst rückwärts über den Zehner. Dann hast du einen Zehner weniger.');
  await enter(page, 77);
  await expect(page.locator('.message')).toHaveText('Schauen wir zusammen: 70 − 3 = 67.');
  await expect(page.locator('.calc-field.shown')).toHaveText('67');
  await page.locator('.next').click();
  await expect(page.locator('.message')).toHaveText('Gemeinsam geschafft! 67 + 23 = 90.');
  await expect(page.locator('.calc-gap.filled')).toHaveText('67');
  await expect(page.locator('.round-label')).toHaveText('1 / 8 Aufgaben');
});

test('the moved gap, solved in one line', async ({ page }) => {
  await startInverse(page, [{ stage: 6, key: 'b:93:27', dueAt: 0 }]);
  await expect(page.locator('.calc-task .calc-eq')).toHaveText(/^27\s*\+/);
  const line = page.locator('.calc-step .calc-eq');
  if (await page.locator('.calc-choice').count()) {
    await page.locator('.calc-choice', { hasText: '93 − 27' }).click();
    await expect(page.locator('.message')).toContainText('Richtig: Aus plus wird minus.');
  }
  await expect(line).toHaveText(/^93 − 20 − 7 =/);
  await enter(page, 66);
  await expect(page.locator('.message')).toHaveText('Richtig! 27 + 66 = 93.');
});

test('choosing the inverse, help in the direct form brings back the two lines, then the check sum', async ({ page }) => {
  // Every chance taken: the choice and the typed check sum come.
  await page.addInitScript(() => (Math.random = () => 0.01));
  await startInverse(page, [{ stage: 7, key: 'f:68:25', dueAt: 0 }]);
  await expect(page.locator('.message')).toHaveText('Welche Umkehraufgabe passt?');
  await expect(page.locator('.calc-inverse .calc-field.pending')).toHaveText('?');
  await expect(page.locator('.keypad')).toBeHidden();
  await page.locator('.calc-choice', { hasText: '68 + 25' }).click();
  await expect(page.locator('.message')).toHaveText('Die Umkehraufgabe rechnet rückwärts: Aus plus wird minus.');
  await page.locator('.next').click();

  await expect(page.locator('.calc-inverse .calc-eq')).toHaveText(/^68 − 25 =/);
  await page.locator('[data-ref="help"]').click();
  await expect(page.locator('.message')).toHaveText('Wir rechnen in zwei Zeilen: zuerst die Zehner, dann die Einer.');
  await expect(page.locator('.calc-step .calc-eq')).toHaveCount(2);
  await enter(page, 48);
  await enter(page, 43);
  await expect(page.locator('.message')).toHaveText('Mach die Probe: Rechne die Plusaufgabe.');
  await expect(page.locator('.calc-probe .calc-eq')).toHaveText(/^43 \+ 25 =/);
  await enter(page, 68);
  await expect(page.locator('.message')).toHaveText('Gemeinsam geschafft! 43 + 25 = 68.');
});

test('choosing the inverse starts with its own example: the right one lights up', async ({ page }) => {
  await startInverse(page, [], 4);
  await expect(page.locator('.message')).toHaveText(
    'Wir suchen die fehlende Zahl zur Plusaufgabe. Dafür rechnen wir rückwärts: 96 − 23. Tippe auf die Aufgabe, die leuchtet.',
  );
  await expect(page.locator('.calc-choice.suggested')).toHaveText('96 − 23', { timeout: 10_000 });
  await page.locator('.calc-choice', { hasText: '96 + 23' }).click();
  await expect(page.locator('.message')).toHaveText('Der leuchtende Knopf ist richtig.');
  await page.locator('.calc-choice.suggested').click();
  await expect(page.locator('.message')).toHaveText(
    'Jetzt in einer Zeile: 96 − 20 − 3. Erst 20 zurück bis 76, dann 3 zurück bis 73. Tippe die Zahl ab, die leuchtet.',
  );
  await expect(page.locator('.calc-field.active .ghost')).toHaveText('73', { timeout: 10_000 });
  await enter(page, 73);
  await expect(page.locator('.message')).toHaveText('Genau! 73 + 23 = 96.');
});

test('keys typed while the parents\' area is open do not type, delete or send a number', async ({ page }) => {
  await startInverse(page, [{ stage: 2, key: 'f:90:23', dueAt: 0 }]);
  await expect(page.locator('.message')).toHaveText('Ziehe zuerst die Zehner ab.');
  const parents = async (keys: () => Promise<void>) => {
    await page.locator('[data-ref="parents"]').click();
    await expect(page.locator('.dialog')).toBeVisible();
    // A tap on the text takes the focus off the sound checkbox: keys reach the page.
    await page.locator('.dialog h2').click();
    await keys();
    await page.locator('.dialog .btn.primary').click();
  };

  await parents(() => page.keyboard.type('70'));
  await expect(page.locator('.calc-field.active')).toHaveText('');

  // Typed on the pad: Backspace and Enter in the dialog leave it.
  for (const d of '70') await page.locator('.key-digit', { hasText: new RegExp(`^${d}$`) }).click();
  await parents(async () => {
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
  });
  await expect(page.locator('.calc-field.active')).toHaveText('70');
  await expect(page.locator('.calc-field.ok')).toHaveCount(0);
  await expect(page.locator('.message')).toHaveText('Ziehe zuerst die Zehner ab.');
  await page.locator('.key-submit').click();
  await expect(page.locator('.calc-field.ok')).toHaveText('70');
});

test('card, message and keypad fit on the screen without scrolling', async ({ page }) => {
  await startInverse(page, [{ stage: 3, key: 'f:93:27', dueAt: 0 }]);
  await enter(page, 73);
  const viewport = page.viewportSize()!;
  for (const selector of ['.calc-card', '.message', '.keypad', '.key-submit']) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box.y + box.height, selector).toBeLessThanOrEqual(viewport.height + 1);
    expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width + 1);
  }
  const card = page.locator('.calc-card');
  expect(await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
