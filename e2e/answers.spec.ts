import { expect, test } from '@playwright/test';
import { finishSpeech, holdSpeech, nextTaskShown, openClock, recordSpeech, startDevice } from './helpers';

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
    // After two mistakes a guided example follows: only its answer counts, marked once it has been read.
    const example = (await page.locator('.message').textContent())?.includes('Die richtige Antwort ist …');
    await (example ? page.locator('.answer.suggested') : answers.first()).click();
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

test('keys typed while the parents\' area is open do not type, delete or send the time', async ({ page }) => {
  await startDevice(page, { forced: [{ type: 'example', track: 'input', tier: 1, pick: 0 }] });
  await page.goto('/#/mathe/uhr');
  await expect(page.locator('.time-display')).toBeVisible();
  // Past the lock of the example, so "Fertig" would send the time.
  await page.waitForTimeout(1800);
  const parents = async (keys: () => Promise<void>) => {
    await page.locator('[data-ref="parents"]').click();
    await expect(page.locator('.dialog')).toBeVisible();
    // A tap on the text takes the focus off the sound checkbox: keys reach the page.
    await page.locator('.dialog h2').click();
    await keys();
    await page.locator('.dialog .btn.primary').click();
  };

  const digit = (d: string) => page.locator('.key-digit', { hasText: new RegExp(`^${d}$`) }).click();
  const submit = page.locator('.key-submit');

  await parents(async () => {
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
  });
  await expect(page.locator('[data-field="hour"]')).toHaveText('–');
  await expect(page.locator('[data-field="minute"]')).toHaveText('––');

  // The example's 3:00, typed on the pad: the hour, the "Minuten" key, both minute digits.
  await expect(submit).toHaveText('Minuten');
  await expect(submit).toBeDisabled();
  await digit('3');
  // A digit too many stays out of the hour field: the minutes have their own.
  await digit('0');
  await expect(page.locator('[data-field="hour"]')).toHaveText('3');
  await expect(page.locator('[data-field="hour"]')).toHaveClass(/active/);
  await submit.click();
  await expect(page.locator('[data-field="minute"]')).toHaveClass(/active/);
  await expect(submit).toHaveText('Fertig');
  await expect(submit).toBeDisabled();
  await digit('0');
  await digit('0');
  // Backspace and Enter in the dialog leave it.
  await parents(async () => {
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
  });
  await expect(page.locator('[data-field="hour"]')).toHaveText('3');
  await expect(page.locator('[data-field="minute"]')).toHaveText('00');
  await expect(page.locator('.message')).not.toContainText('Genau!');
  await page.locator('.key-submit').click();
  await expect(page.locator('.message')).toContainText('Genau!');
});

test('typing 12:00 on a phone: every digit stays in its field, which can be corrected', async ({ page }) => {
  await startDevice(page, { forced: [{ type: 'example', track: 'input', tier: 1, pick: 2 }] });
  const hour = page.locator('[data-field="hour"]');
  const minute = page.locator('[data-field="minute"]');
  const submit = page.locator('.key-submit');
  const digit = (d: string) => page.locator('.key-digit', { hasText: new RegExp(`^${d}$`) }).click();

  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 667, height: 375 }, { width: 1180, height: 820 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/mathe/uhr');
    await page.reload();
    await expect(page.locator('.message')).toHaveText('Es ist 12:00 Uhr. Tippe 12, dann auf „Minuten“ und 0 0.');
    // Clock, fields and keys fit without scrolling; the word fits its key.
    for (const selector of ['.clock', '.time-display', '.keypad', '.key-submit']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.y, selector).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, selector).toBeLessThanOrEqual(viewport.height + 1);
      expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width + 1);
    }
    expect(await submit.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect((await page.locator('.key-digit').first().boundingBox())!.width).toBeGreaterThanOrEqual(44);
  }

  const steps: [string, string, string][] = [['1', '1', '––'], ['2', '12', '––'], ['0', '12', '––']];
  for (const [d, h, m] of steps) {
    await digit(d);
    await expect(hour).toHaveText(h);
    await expect(minute).toHaveText(m);
  }
  await submit.click();
  await digit('3');
  await digit('0');
  await expect(minute).toHaveText('30');
  // Correcting: backspace deletes in the minutes, from the empty field it goes back to the hour.
  for (let i = 0; i < 3; i++) await page.locator('.key-back').click();
  await expect(hour).toHaveClass(/active/);
  await expect(hour).toHaveText('12');
  await expect(submit).toHaveText('Minuten');
  // A tap on a field makes it the active one.
  await minute.click();
  await expect(minute).toHaveClass(/active/);
  await digit('0');
  await digit('0');
  await hour.click();
  await expect(hour).toHaveClass(/active/);
  await expect(minute).toHaveText('00');
  // Enter is the key for the next step.
  await page.waitForTimeout(1800);
  await page.keyboard.press('Enter');
  await expect(submit).toHaveText('Fertig');
  // Minutes that do not exist are typed again; the explanation comes back with the next digit.
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('75');
  await page.keyboard.press('Enter');
  await expect(page.locator('.message')).toHaveText('12:75 gibt es nicht. Tippe die Minuten noch einmal.');
  await expect(minute).toHaveText('––');
  await expect(hour).toHaveAttribute('aria-label', 'Stunde: 12');
  await page.keyboard.type('0');
  await expect(page.locator('.message')).toContainText('Tippe 12, dann auf „Minuten“');
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await expect(page.locator('.message')).toContainText('Genau!');
});

test('at a full hour the explanation marks the number the short hand points at, not the field after it', async ({ page }) => {
  await startDevice(page, { forced: [{ type: 'example', track: 'digital', tier: 1, pick: 2 }] });
  await openClock(page);
  await expect(page.locator('.message')).toContainText('Es ist 12:00 Uhr.');
  await expect(page.locator('.focus-hour-number')).toHaveCount(1);
  await expect(page.locator('.focus-hour')).toHaveCount(0);
  // Behind the 12, at the top of the dial.
  const mark = (await page.locator('.focus-hour-number').boundingBox())!;
  const twelve = (await page.locator('.clock-numbers text', { hasText: /^12$/ }).boundingBox())!;
  expect(Math.abs(mark.x + mark.width / 2 - (twelve.x + twelve.width / 2))).toBeLessThan(3);
  expect(Math.abs(mark.y + mark.height / 2 - (twelve.y + twelve.height / 2))).toBeLessThan(6);
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
  // The example's own explanation first.
  await finishSpeech(page);
  await page.locator('.answer.suggested').click();
  await expect(page.locator('.message')).toContainText('Genau!');
  await page.locator('[data-ref="speak"]').click();
  await page.clock.runFor(5000);
  await expect(page.locator('.message')).toContainText('Genau!');
  await finishSpeech(page);
  await expect(page.locator('.message')).toContainText('Die richtige Antwort ist …');
});

test('a guided example is read aloud first: taps wait a moment, the answer lights up once read', async ({ page }) => {
  await holdSpeech(page);
  await page.clock.install();
  await startDevice(page);
  await openClock(page);
  const speaker = page.locator('[data-ref="speak"]');
  await expect(speaker).toHaveAttribute('aria-label', 'Vorlesen stoppen');
  await expect(page.locator('.answer.suggested')).toHaveCount(0);

  // A reflex tap does nothing, and nothing lights up while it is still read.
  for (const answer of await page.locator('.answer').all()) await answer.click();
  await page.clock.runFor(10_000);
  await expect(page.locator('.answer.correct, .answer.wrong, .answer.suggested')).toHaveCount(0);

  // Stopping counts as read.
  await speaker.click();
  await expect(speaker).toHaveAttribute('aria-label', 'Vorlesen');
  await expect(page.locator('.answer.suggested')).toHaveCount(1);
  // A wrong tap now points to the marked answer, still without a mistake.
  await page.locator('.answer:not(.suggested)').first().click();
  await expect(page.locator('.message')).toContainText('Der leuchtende Knopf ist richtig.');
  await expect(speaker).toHaveAttribute('aria-label', 'Vorlesen stoppen');
  await expect(page.locator('.answer.wrong')).toHaveCount(0);
  await speaker.click();
  await page.locator('.answer.suggested').click();
  await expect(page.locator('.message')).toContainText('Genau!');
});

test('after a mistake "Weiter" waits a moment, nothing is read aloud by itself', async ({ page }) => {
  await recordSpeech(page);
  await startDevice(page, { forced: [] });
  await openClock(page);
  const answers = page.locator('.answer');
  for (let i = 0; ; i++) {
    expect(i, 'no wrong answer within 15 tasks').toBeLessThan(15);
    // After two mistakes a guided example follows: only its answer counts, marked once it has been read.
    const example = (await page.locator('.message').textContent())?.includes('Die richtige Antwort ist …');
    await (example ? page.locator('.answer.suggested') : answers.first()).click();
    await expect(page.locator('.answer.correct')).toHaveCount(1);
    if (await answers.first().evaluate((b) => b.classList.contains('wrong'))) break;
    await nextTaskShown(page);
  }
  const next = page.locator('.next');
  await expect(next).toBeDisabled();
  await expect(next).toBeEnabled();
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(spoken.filter((s) => s.includes('Schauen wir zusammen'))).toEqual([]);
});

test('a second tap on "Weiter" does not answer the next task, which moved into its place', async ({ page }) => {
  await startDevice(page, { forced: [{ type: 'easy' }, { type: 'easy' }] });
  await openClock(page);
  const answers = page.locator('.answer');
  // Tap the first answer until it is a wrong one (a right one moves on by itself).
  for (let i = 0; ; i++) {
    expect(i, 'no wrong answer within 15 tasks').toBeLessThan(15);
    const example = (await page.locator('.message').textContent())?.includes('Die richtige Antwort ist …');
    await (example ? page.locator('.answer.suggested') : answers.first()).click();
    await expect(page.locator('.answer.correct')).toHaveCount(1);
    if (await answers.first().evaluate((b) => b.classList.contains('wrong'))) break;
    await nextTaskShown(page);
  }
  await page.locator('.next').click();
  await expect(page.locator('.answer.correct')).toHaveCount(0);

  // The second tap right after it, wherever the answers are now: it passes through.
  const box = (await answers.first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // A click that does not pass the pointer (keyboard) is ignored as well.
  await answers.first().dispatchEvent('click');
  await page.waitForTimeout(300);
  // Checked once: a right answer would move on by itself and clear its marks.
  expect(await page.locator('.answer.correct, .answer.wrong, .answer.faded').count()).toBe(0);

  // A moment later the answers take taps again.
  await answers.first().click();
  await expect(page.locator('.answer.correct')).toHaveCount(1);
});
