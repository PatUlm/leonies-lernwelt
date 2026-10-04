// Takes the README screenshots from a running dev server.
// Usage: npm run dev, then: node scripts/screenshots.mjs [http://localhost:5173]
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = 'docs/screenshots';
const LANDSCAPE = { width: 1180, height: 820 };
const PORTRAIT = { width: 820, height: 1180 };

/** Runs inside the page: plays simulated sessions with the real engine and stores the progress. */
async function seedProgress(page, { tasks, accuracy, seed, textHeavy = false, daytimeHeavy = false, nearTrophy = false }) {
  await page.evaluate(
    async ({ tasks, accuracy, seed, textHeavy, daytimeHeavy, nearTrophy }) => {
      const { Engine, freshProgress, SESSION_GAP_MS } = await import('/src/modules/clock/engine.ts');
      let a = seed >>> 0;
      const rng = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      let now = Date.now() - (tasks / 10 + 2) * (SESSION_GAP_MS + 1);
      const engine = new Engine(freshProgress(now), rng);
      for (let i = 0; i < tasks; i++) {
        if (i % 10 === 0) now += SESSION_GAP_MS + 1;
        engine.touch(now);
        const t = engine.nextTask();
        const ok = t.kind === 'example' || rng() < accuracy;
        engine.answer(t, ok ? t.correctIndex : t.options.findIndex((o) => o.kind !== 'correct'), false);
      }
      const p = engine.progress;
      p.forced = [];
      p.reviewQueue = [];
      p.lastActive = Date.now();
      if (textHeavy) p.sideShares.text.step = 2;
      if (daytimeHeavy) p.sideShares.daytime.step = 1;
      if (nearTrophy) p.round.points = p.round.target - 5;
      else p.round.points = Math.round((p.round.target * 0.45) / 5) * 5;
      localStorage.setItem('lernwelt.uhr.progress.v1', JSON.stringify(p));
    },
    { tasks, accuracy, seed, textHeavy, daytimeHeavy, nearTrophy },
  );
}

async function openClock(page, predicate, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/mathe/uhr`);
    await page.waitForSelector('.answer');
    if (await page.evaluate(predicate)) return;
  }
  throw new Error('wanted task did not come up');
}

const isDigitalQuestion = () => document.querySelector('.message')?.textContent?.includes('Wie spät ist es?');
const isDaytimeQuestion = () => !document.querySelector('.daytime')?.hidden && document.querySelector('.answer.suggested') === null;
const isTextQuestion = () => document.querySelector('.message')?.textContent?.includes('Wie sagt man?');

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

async function context(viewport, reducedMotion = 'reduce') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion, locale: 'de-DE' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  return { ctx, page };
}

// Dashboard with a few weeks of practice.
{
  const { ctx, page } = await context(LANDSCAPE);
  await seedProgress(page, { tasks: 420, accuracy: 0.9, seed: 7 });
  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('.area-card');
  await page.screenshot({ path: `${OUT}/dashboard.png` });

  // Learning area with its modules.
  await page.goto(`${BASE}/#/mathe`);
  await page.waitForSelector('.module-tile');
  await page.screenshot({ path: `${OUT}/area.png` });

  // Reading the clock (landscape tablet).
  await openClock(page, isDigitalQuestion);
  await page.screenshot({ path: `${OUT}/clock-question.png` });

  // A wrong answer with its explanation.
  for (let i = 0; ; i++) {
    await openClock(page, isDigitalQuestion);
    await page.locator('.answer').nth(i % 3).click();
    if (await page.locator('.answer.chosen').count()) break;
    if (i > 40) throw new Error('no wrong answer found');
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/clock-hint.png` });
  await ctx.close();
}

// Answers in words (portrait tablet).
{
  const { ctx, page } = await context(PORTRAIT);
  await seedProgress(page, { tasks: 700, accuracy: 0.95, seed: 3, textHeavy: true });
  await openClock(page, isTextQuestion, 80);
  await page.screenshot({ path: `${OUT}/clock-text.png` });
  await ctx.close();
}

// Afternoon times: context beside the clock.
for (const [name, viewport] of [['clock-afternoon', LANDSCAPE]]) {
  const { ctx, page } = await context(viewport);
  await seedProgress(page, { tasks: 400, accuracy: 0.95, seed: 5, daytimeHeavy: true });
  await openClock(page, isDaytimeQuestion, 120);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
}

// Trophy at the end of a round, with falling sweets.
{
  const { ctx, page } = await context(PORTRAIT, 'no-preference');
  await seedProgress(page, { tasks: 120, accuracy: 0.9, seed: 11, nearTrophy: true });
  await openClock(page, () => true);
  for (let i = 0; i < 60 && !(await page.locator('.trophy').count()); i++) {
    if (await page.locator('.dialog[open]').count()) await page.locator('.dialog[open] .btn.primary').click();
    else if (await page.locator('.next:not([hidden])').count()) await page.locator('.next').click();
    else if (await page.locator('.answer:not(:disabled)').count()) await page.locator('.answer:not(:disabled)').nth(i % 3).click();
    await page.waitForTimeout(1600);
  }
  await page.waitForSelector('.trophy');
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/trophy.png` });
  await ctx.close();
}

await browser.close();
console.log(`Screenshots written to ${OUT}/`);
