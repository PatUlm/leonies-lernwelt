import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { startDevice } from './helpers';

/** A profile name of its own for each project and repetition (one API serves the whole run). */
function uniqueName(prefix: string, testInfo: TestInfo): string {
  const project = testInfo.config.projects.findIndex((p) => p.name === testInfo.project.name);
  return `${prefix} ${project + 1}-${testInfo.repeatEachIndex + 1}`;
}

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const d of pin) await page.locator('.keypad').getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: '✓' }).click();
}

test('imprint and privacy notice are linked from the sign-in and the dashboard', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const legal = page.getByRole('navigation', { name: 'Rechtliches' });
  await legal.getByRole('link', { name: 'Impressum' }).click();
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await page.getByRole('link', { name: 'Datenschutzhinweis' }).click();
  await expect(page.getByRole('heading', { name: 'Datenschutzhinweis' })).toBeVisible();

  await startDevice(page);
  await page.goto('/#/');
  await page.getByRole('navigation', { name: 'Rechtliches' }).getByRole('link', { name: 'Datenschutz' }).click();
  await expect(page.getByRole('heading', { name: 'Datenschutzhinweis' })).toBeVisible();
});

test('creating a profile suggests a nickname and mentions the leaderboard', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const note = page.locator('.login-note');
  await expect(note).toBeHidden();
  await page.getByRole('button', { name: 'Ich bin neu hier – Profil anlegen' }).click();
  await expect(note).toBeVisible();
  await expect(note).toContainText('Spitznamen');
  await expect(note).toContainText('Bestenliste');
});

test('a profile can be deleted with its PIN and is gone afterwards', async ({ page }, testInfo) => {
  const name = uniqueName('Löschi', testInfo);
  await startDevice(page, { forced: [], profile: name });
  await page.goto('/#/');
  await page.getByRole('link', { name: 'Profil löschen' }).click();
  await expect(page.getByRole('heading', { name: 'Profil löschen' })).toBeVisible();

  page.on('dialog', (d) => void d.accept());
  await enterPin(page, '0000');
  await expect(page.locator('.login-error')).toHaveText('Die PIN stimmt nicht.');
  await enterPin(page, '1234');

  // Back at "Wer lernt hier?": the name no longer exists, so signing in turns into a new profile.
  await expect(page.getByRole('heading', { name: 'Wer lernt hier?' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await enterPin(page, '1234');
  await expect(page.locator('.login-intro')).toContainText('gibt es noch nicht');
});
