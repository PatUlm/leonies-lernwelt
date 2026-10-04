import { expect, test } from '@playwright/test';
import { nextTaskShown, openClock, startDevice } from './helpers';

test('points played in the clock show up in the weekly leaderboard', async ({ page }, testInfo) => {
  // One API serves the whole run: each project and repetition needs its own profile.
  const project = testInfo.config.projects.findIndex((p) => p.name === testInfo.project.name);
  const name = `Lea ${project + 1}-${testInfo.repeatEachIndex + 1}`;
  await startDevice(page, { forced: [], profile: name });
  await openClock(page);

  // Play until some points are earned (wrong answers give none).
  const label = page.locator('[data-ref="roundLabel"]');
  for (let i = 0; ; i++) {
    expect(i, 'no right answer within 15 tasks').toBeLessThan(15);
    // After two mistakes a guided example follows: only its marked answer counts.
    const suggested = page.locator('.answer.suggested');
    await ((await suggested.count()) ? suggested : page.locator('.answer').nth(i % 3)).click();
    await expect(page.locator('.answer.correct')).toHaveCount(1);
    const next = page.locator('.next:not([hidden])');
    if (await next.count()) await next.click();
    // Three mistakes in a row offer a break.
    const keepGoing = page.getByRole('button', { name: 'Weiter üben' });
    if (await keepGoing.isVisible()) await keepGoing.click();
    if (!(await label.textContent())?.startsWith('0 ')) break;
    await nextTaskShown(page);
  }
  const points = Number((await label.textContent())!.split(' ')[0]);

  await page.goto('/#/');
  const board = page.locator('.leaderboard');
  await expect(board).toBeVisible();
  const own = board.locator('.lb-row.me');
  await expect(own.locator('.lb-name')).toHaveText(name);
  await expect(own.locator('.lb-points')).toHaveText(`${points} ${points === 1 ? 'Punkt' : 'Punkte'}`);
  await expect(own.locator('.lb-cup svg')).toBeVisible();
});
