// Takes the README screenshots from a running dev server.
// Usage: npm run dev and the API with an empty data directory
// (DATA_DIR=$(mktemp -d) PORT=8081 node server/src/main.ts), then:
// node scripts/screenshots.mjs [http://localhost:5173]
// The profile "Leonie" (PIN 1234) is created on the first run.
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
        if (t.mode === 'choice') engine.answer(t, ok ? t.correctIndex : t.options.findIndex((o) => o.kind !== 'correct'), false, 3000);
        else engine.answerTime(t, ok ? t.time : { hour: (t.time.hour % 12) + 1, minute: t.time.minute }, false, 3000);
      }
      const p = engine.progress;
      p.forced = [];
      p.reviewQueue = [];
      p.lastActive = Date.now();
      // Leave the last text / afternoon tier unfinished, so those tasks come often.
      const learn = (track) => { const t = p.tracks[track].filter((x) => x.unlocked).at(-1); if (t) { t.ready = false; t.mastery = 0; } };
      if (textHeavy) learn('text');
      if (daytimeHeavy) {
        // Afternoon tasks with their picture: make sure the daytime track is open.
        p.tracks.daytime[0].unlocked = true;
        learn('daytime');
      }
      if (nearTrophy) {
        p.round.points = p.round.target - 5;
        // Only choice tasks, so the script can answer them by tapping.
        for (const track of ['set', 'input', 'halb']) for (const t of p.tracks[track]) t.unlocked = false;
      }
      else p.round.points = Math.round((p.round.target * 0.45) / 5) * 5;
      localStorage.setItem('lernwelt.uhr.progress.v1', JSON.stringify(p));
      // Sign in as Leonie, so title and greeting carry her name. The seeded progress
      // counts as her newer unsaved change and replaces the one on the server.
      localStorage.setItem('lernwelt.sync.v1', JSON.stringify({ revision: 0, dirty: true, updatedAt: Date.now(), profile: 'Leonie' }));
      const { sync } = await import('/src/shared/sync.ts');
      await sync.login('Leonie', '1234').catch((err) => {
        if (err.code === 'unknown_name') return sync.signup('Leonie', '1234');
        throw err;
      });
    },
    { tasks, accuracy, seed, textHeavy, daytimeHeavy, nearTrophy },
  );
}

async function openClock(page, predicate, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/mathe/uhr`);
    await page.waitForSelector('.answers > *');
    if (await page.evaluate(predicate)) return;
  }
  throw new Error('wanted task did not come up');
}

const isDigitalQuestion = () =>
  document.querySelector('.message')?.textContent?.includes('Wie spät ist es?') &&
  document.querySelector('.answers.mode-choice .answer') !== null &&
  document.querySelector('.daytime')?.hidden;
const isSetTask = () => document.querySelector('.clock.settable') !== null;
const isInputTask = () => document.querySelector('.keypad') !== null;
const isDaytimeQuestion = () => !document.querySelector('.daytime')?.hidden && document.querySelector('.answer.suggested') === null;
const isTextQuestion = () => document.querySelector('.message')?.textContent?.includes('Wie sagt man?');

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

async function context(viewport, reducedMotion = 'reduce') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion, locale: 'de-DE' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
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
    if (await page.locator('.answer.wrong').count()) break;
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

// Phones: portrait and landscape.
for (const [name, viewport] of [['phone-portrait', { width: 390, height: 844 }], ['phone-landscape', { width: 844, height: 390 }]]) {
  const { ctx, page } = await context(viewport);
  await seedProgress(page, { tasks: 300, accuracy: 0.92, seed: 9 });
  await openClock(page, isDigitalQuestion);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
}

// Setting the hands and typing the time (tablet landscape).
{
  const { ctx, page } = await context(LANDSCAPE);
  await seedProgress(page, { tasks: 500, accuracy: 0.97, seed: 21 });
  await openClock(page, isSetTask, 150);
  await page.screenshot({ path: `${OUT}/clock-set.png` });
  await openClock(page, isInputTask, 150);
  for (const d of '1') await page.click(`.key-digit[aria-label="${d}"]`);
  await page.screenshot({ path: `${OUT}/clock-input.png` });
  await ctx.close();
}

// Sign-in: "Wer lernt hier?" (fresh device, no seed).
{
  const { ctx, page } = await context(PORTRAIT);
  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('.login');
  await page.fill('[data-ref="name"]', 'Leonie');
  for (const d of '12') await page.click(`.key-digit[aria-label="${d}"]`);
  await page.screenshot({ path: `${OUT}/login.png` });
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
    // Setting the hands still comes up as practice after a wrong answer.
    else if (await page.locator('.check:not(:disabled)').count()) await page.locator('.check').click();
    await page.waitForTimeout(1600);
  }
  await page.waitForSelector('.trophy');
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/trophy.png` });
  await ctx.close();
}

await browser.close();
console.log(`Screenshots written to ${OUT}/`);
