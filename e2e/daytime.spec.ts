import { expect, test } from '@playwright/test';
import { nextTaskShown, openClock, recordSpeech, startDevice } from './helpers';

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

  await page.locator('[data-ref="speak"]').click();
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(spoken.join(' ').match(/Es ist Nachmittag\./g)).toHaveLength(1);
  expect(spoken[0]).toMatch(/^Es ist Nachmittag\. Schau mal:/);

  // Stays during the feedback ...
  await page.locator('.answer.suggested').click();
  await expect(picture).toBeVisible();
  await expect(sentence).toHaveText('Es ist Nachmittag.');

  // ... and is gone with the next task without a time of day.
  await nextTaskShown(page);
  await expect(picture).toBeHidden();
  await expect(sentence).toBeEmpty();
});
