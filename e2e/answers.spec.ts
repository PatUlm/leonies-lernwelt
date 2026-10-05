import { expect, test } from '@playwright/test';
import { finishSpeech, holdSpeech, nextTaskShown, openClock, startDevice } from './helpers';

/** --bad and --good in style.css. */
const RED = 'rgb(220, 38, 38)';
const GREEN = 'rgb(22, 163, 74)';

test('a wrong choice turns red with a cross, the other wrong ones grey, the right one green', async ({ page }) => {
  await startDevice(page, { forced: [] });
  await openClock(page);
  const answers = page.locator('.answer');

  // Tap the first answer until it is a wrong one (a right one moves on by itself).
  for (let i = 0; ; i++) {
    expect(i, 'no wrong answer within 15 tasks').toBeLessThan(15);
    await answers.first().click();
    await expect(page.locator('.answer.correct')).toHaveCount(1);
    if (await answers.first().evaluate((b) => b.classList.contains('wrong'))) break;
    await nextTaskShown(page);
  }

  const count = await answers.count();
  await expect(page.locator('.answer.wrong')).toHaveCount(1);
  await expect(page.locator('.answer.faded')).toHaveCount(count - 2);
  await expect(page.locator('.answer.correct.faded, .answer.correct.wrong')).toHaveCount(0);
  // What the child sees: red with a cross, green, grey.
  await expect(answers.first()).toHaveCSS('border-top-color', RED);
  expect(await answers.first().evaluate((b) => getComputedStyle(b, '::after').content)).toBe('"✗"');
  await expect(page.locator('.answer.correct')).toHaveCSS('border-top-color', GREEN);
  await expect(page.locator('.answer.faded').first()).toHaveCSS('opacity', '0.45');

  // The next task starts without any marks.
  await page.locator('.next').click();
  await nextTaskShown(page);
  await expect(page.locator('.answer.wrong, .answer.faded')).toHaveCount(0);
});

test('a right choice stays green and greys out all other answers', async ({ page }) => {
  // The guided example marks the right answer.
  await startDevice(page);
  await openClock(page);
  const right = page.locator('.answer.suggested');
  await right.click();

  await expect(right).toHaveClass(/correct/);
  await expect(right).toHaveCSS('border-top-color', GREEN);
  await expect(page.locator('.answer.faded')).toHaveCount((await page.locator('.answer').count()) - 1);
  await expect(page.locator('.answer.faded').first()).toHaveCSS('opacity', '0.45');
  await expect(page.locator('.answer.wrong')).toHaveCount(0);
});

test('after a right answer, the next time waits until the explanation has been read aloud', async ({ page }) => {
  await holdSpeech(page);
  await page.clock.install();
  await startDevice(page);
  await openClock(page);
  await page.locator('.answer.suggested').click();
  await expect(page.locator('.message')).toContainText('Genau!');
  await page.locator('[data-ref="speak"]').click();
  await page.clock.runFor(5000);
  await expect(page.locator('.message')).toContainText('Genau!');
  await finishSpeech(page);
  await expect(page.locator('.message')).toContainText('Schau mal');
});
