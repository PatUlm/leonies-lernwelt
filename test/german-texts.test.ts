import { describe, expect, it } from 'vitest';
import { germanTexts } from '../scripts/german-texts';

describe('German texts to record', () => {
  const texts = germanTexts();

  it('stay few enough for the daily limit of the speech service', () => {
    expect(texts.length).toBeGreaterThan(100);
    expect(texts.length).toBeLessThan(600);
  });

  it('are in their spoken form, without clock times in digits', () => {
    for (const { text } of texts) expect(text).not.toMatch(/\d:\d\d/);
  });

  it('contain the examples and the fixed sentences', () => {
    const all = texts.map((t) => t.text);
    expect(all).toContain('Der leuchtende Knopf ist richtig.');
    expect(all).toContain('Es heißt der Hund. Die richtige Antwort ist …');
    expect(all.some((t) => t.startsWith('Es ist Nachmittag.'))).toBe(true);
    // English examples: the German parts around the recorded English word.
    expect(all).toEqual(expect.arrayContaining(['Neues Wort:', 'heißt rot.', 'Die richtige Antwort ist …']));
  });
});
