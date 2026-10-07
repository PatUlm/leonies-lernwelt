import { expect, test, type Page } from '@playwright/test';

type Spoken = { text: string; lang: string };

/**
 * Speech synthesis with the given voices that ends each part at once;
 * window.__spoken lists every part with its language. Server recordings play
 * at once with `recordings` (window.__played lists their URLs) and fail
 * without, so the device voice takes over.
 */
async function fakeVoices(page: Page, langs: string[], recordings = false): Promise<void> {
  await page.addInitScript(({ langs, recordings }) => {
    const spoken: { text: string; lang: string }[] = [];
    const played: string[] = [];
    Object.assign(window, { __spoken: spoken, __played: played });
    // No real loading: the UI tests run without the speech service.
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      configurable: true,
      get() {
        return (this as HTMLMediaElement).dataset.src ?? '';
      },
      set(url: string) {
        (this as HTMLMediaElement).dataset.src = new URL(url, location.href).href;
      },
    });
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!recordings) return Promise.reject(new DOMException('no recording', 'NotSupportedError'));
      played.push(this.src);
      setTimeout(() => this.dispatchEvent(new Event('playing')), 0);
      setTimeout(() => this.dispatchEvent(new Event('ended')), 1);
      return Promise.resolve();
    };
    // Real utterances accept only real voices; the fake one takes any.
    class Utterance {
      lang = '';
      voice: unknown = null;
      rate = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    const synth = {
      speak(u: Utterance) {
        spoken.push({ text: u.text, lang: u.lang });
        setTimeout(() => {
          u.onstart?.();
          u.onend?.();
        }, 0);
      },
      cancel() {},
      getVoices: () => langs.map((lang) => ({ lang, name: `Test ${lang}` })),
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  }, { langs, recordings });
}

function spoken(page: Page): Promise<Spoken[]> {
  return page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken);
}

function played(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __played: string[] }).__played.map((url) => new URL(url).pathname + new URL(url).search));
}

/** Fresh device playing locally; with `skipExamples` the three first examples are already done. */
async function startEnglish(page: Page, skipExamples = false): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (skipExamples) => {
    localStorage.clear();
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { freshProgress } = await load('/src/modules/english/engine.ts');
    const { saveProgress } = await load('/src/modules/english/storage.ts');
    const { sync } = await load('/src/shared/sync.ts');
    const p = freshProgress(Date.now());
    if (skipExamples) p.forced = [];
    saveProgress(p);
    sync.playLocally();
  }, skipExamples);
  await page.goto('/#/englisch/woerter');
  await expect(page.locator('.answer').first()).toBeEnabled();
}

test('the Englisch area offers "Farben, Zahlen, Tiere"', async ({ page }) => {
  await fakeVoices(page, ['de-DE', 'en-GB']);
  await startEnglish(page);
  await page.goto('/#/englisch');
  await expect(page.locator('.module-title')).toHaveText('Farben, Zahlen, Tiere');
  await page.locator('.module-tile').click();
  await expect(page.locator('.word-card')).toBeVisible();
});

test('a new word is shown, spoken in English and tapped with help of the glowing button', async ({ page }) => {
  await fakeVoices(page, ['de-DE', 'en-GB']);
  await startEnglish(page);
  await expect(page.locator('.message')).toHaveText('Neues Wort: red heißt rot. Die richtige Antwort wird gleich hervorgehoben – tippe sie an.');
  await expect(page.locator('.word-card .en-word')).toHaveText('red');
  await expect(page.locator('.answer')).toHaveCount(2);
  expect(await spoken(page)).toContainEqual({ text: 'red', lang: 'en-GB' });
  await page.locator('.answer.suggested').click();
  await expect(page.locator('.message')).toContainText('Genau! red heißt rot.');
});

test('English words play the server recording, the German parts stay with the device voice', async ({ page }) => {
  await fakeVoices(page, ['de-DE', 'en-GB'], true);
  await startEnglish(page);
  await expect(page.locator('.message')).toHaveText('Neues Wort: red heißt rot. Die richtige Antwort wird gleich hervorgehoben – tippe sie an.');
  await page.locator('[data-ref="speak"]').click();
  await expect.poll(async () => (await spoken(page)).map((s) => s.text)).toContain(' Die richtige Antwort wird gleich hervorgehoben – tippe sie an.');
  expect(await played(page)).toContain('/api/tts?lang=en&word=red');
  expect((await spoken(page)).filter((s) => s.lang !== 'de-DE')).toEqual([]);
});

test('listening: only the speaker on the card; a mistake names the word and waits', async ({ page }) => {
  await fakeVoices(page, ['de-DE', 'en-GB']);
  await startEnglish(page, true);
  await expect(page.locator('.message')).toHaveText('Hör gut zu: Welche Farbe ist das?');
  await expect(page.locator('.word-card .listen-button')).toBeVisible();
  await expect(page.locator('.word-card .en-word')).toHaveCount(0);
  const word = (await spoken(page)).at(-1)!;
  expect(word.lang).toBe('en-GB');

  const correct = await page.evaluate(async (en) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { wordByEn } = await load('/src/modules/english/words.ts');
    return wordByEn(en).color as string;
  }, word.text);
  const answers = page.locator('.answer');
  const fills = await answers.evaluateAll((els) => els.map((e) => e.querySelector('g')!.getAttribute('fill')));
  await answers.nth(fills.findIndex((f) => f !== correct)).click();
  await expect(page.locator('.message')).toContainText(`Schauen wir zusammen. ${word.text} heißt`);
  await expect(page.locator('.word-card .en-word')).toHaveText(word.text);
  await page.locator('.next').click();
  await expect(page.locator('.round-label')).toHaveText('1 / 10 Aufgaben');
});

test('without an English voice the words are read', async ({ page }) => {
  await fakeVoices(page, ['de-DE']);
  await startEnglish(page, true);
  await expect(page.locator('.toast')).toContainText('keine englische Stimme');
  await expect(page.locator('.message')).toHaveText('Lies das Wort: Welche Farbe ist das?');
  await expect(page.locator('.word-card .en-word')).toBeVisible();
  await expect(page.locator('.word-card .listen-button')).toHaveCount(0);
});

test('without an English voice, reading aloud leaves the English word to the eyes', async ({ page }) => {
  await fakeVoices(page, ['de-DE']);
  await startEnglish(page);
  await page.locator('[data-ref="speak"]').click();
  await expect.poll(async () => (await spoken(page)).at(-1)).toEqual({
    text: 'Neues Wort: Das englische Wort heißt rot. Die richtige Antwort wird gleich hervorgehoben – tippe sie an.',
    lang: 'de-DE',
  });
});

test('the card, the question and all answers fit on the screen', async ({ page }) => {
  await fakeVoices(page, ['de-DE', 'en-GB']);
  await startEnglish(page);
  const viewport = page.viewportSize()!;
  for (const selector of ['.word-card', '.message', '.answer']) {
    for (const box of await page.locator(selector).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
      expect(box.left, selector).toBeGreaterThanOrEqual(0);
      expect(box.right, selector).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box.bottom, selector).toBeLessThanOrEqual(viewport.height + 0.5);
    }
  }
});
