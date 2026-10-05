import { describe, expect, it } from 'vitest';
import { Engine, STAGES, freshProgress } from '../../src/modules/english/engine';
import { REFRESH_AFTER_MS, statsFromProgress } from '../../src/modules/english/stats';
import { sanitizeProgress } from '../../src/modules/english/storage';
import { example, meaning, mistake, plain, question, withoutEnglish } from '../../src/modules/english/texts';
import { STAGE_WORDS, WORDS, wordByEn } from '../../src/modules/english/words';
import { SUGGESTION_PRIORITY } from '../../src/modules/types';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;

describe('word lists', () => {
  it('has every word once, each in exactly one stage', () => {
    const staged = STAGE_WORDS.flat();
    expect(new Set(WORDS.map((w) => w.en)).size).toBe(WORDS.length);
    expect([...staged].sort()).toEqual(WORDS.map((w) => w.en).sort());
    expect(STAGE_WORDS).toHaveLength(STAGES.length);
  });

  it('has a picture for every word and the numbers 1 to 20', () => {
    for (const w of WORDS) {
      if (w.category === 'colour') expect(w.color).toMatch(/^#[0-9a-f]{6}$/);
      if (w.category === 'animal') expect(w.emoji).toBeTruthy();
    }
    expect(WORDS.filter((w) => w.category === 'number').map((w) => w.value)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('always has another picture of the same kind to compare, through all stages', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    for (let i = 0; i < 1000 && !engine.stageState(7).ready; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      expect(t.options.length, t.key).toBeGreaterThanOrEqual(2);
      engine.answer(t, t.correctIndex, false);
    }
    expect(engine.stageState(7).ready).toBe(true);
  });
});

describe('texts', () => {
  const engine = new Engine(freshProgress(T0), seeded(1));
  const task = (key: string) => engine.makeTask(1, 'practice', key)!;

  it('keeps English words apart from the German text', () => {
    expect(meaning(wordByEn('red')!)).toEqual([{ en: 'red' }, ' heißt rot.']);
    expect(plain(mistake(task('l:red')))).toBe('red heißt rot. Hör es dir noch einmal an.');
    expect(plain(mistake(task('r:red')))).toBe('red heißt rot.');
    expect(plain(question(task('l:red')))).toBe('Hör gut zu: Welche Farbe ist das?');
    expect(plain(question(task('w:red')))).toBe('Wie heißt das auf Englisch?');
    const ex = engine.makeTask(1, 'example', 'l:blue', true)!;
    expect(plain(example(ex))).toBe('Neues Wort: blue heißt blau. Tippe auf den leuchtenden Knopf.');
  });

  it('leaves the English word out for a German voice', () => {
    expect(withoutEnglish(['Richtig! ', ...meaning(wordByEn('three')!)])).toBe('Richtig! Das englische Wort heißt drei.');
  });
});

describe('progress', () => {
  it('starts fresh on anything that is not a progress', () => {
    for (const raw of [null, 'x', [], { version: 2 }]) expect(sanitizeProgress(raw, T0)).toEqual(freshProgress(T0));
  });

  it('keeps only known words and valid numbers from another device', () => {
    const raw = {
      ...freshProgress(T0),
      known: { red: 3, magenta: 5, blue: 'x', green: -2 },
      stages: [{ unlocked: true, introduced: 99, mastery: 500 }, { unlocked: true, introduced: 0 }],
      forced: [{ type: 'example', stage: 9, word: 'red' }, { type: 'example', stage: 1, word: 'red', isNew: true }],
    };
    const p = sanitizeProgress(JSON.parse(JSON.stringify(raw)), T0);
    expect(p.known).toEqual({ red: 3, green: 0 });
    expect(p.stages[0]).toMatchObject({ introduced: 6, mastery: 120 });
    expect(p.stages[1]).toMatchObject({ unlocked: true, introduced: 3 });
    expect(p.stages[2]).toMatchObject({ unlocked: false, introduced: 0 });
    expect(p.forced).toEqual([{ type: 'example', stage: 1, word: 'red', isNew: true }]);
  });
});

describe('stats', () => {
  it('suggests discovering English before the first answer', () => {
    const s = statsFromProgress(freshProgress(T0), T0);
    expect(s.started).toBe(false);
    expect(s.goals).toEqual({ done: 0, total: 7, label: '0 von 7 Lernzielen sicher', sweets: [0, 0, 0, 0, 0, 0, 0] });
    expect(s.nextGoal).toBe('Nächstes Ziel: Farben');
    expect(s.suggestion).toEqual({ priority: SUGGESTION_PRIORITY.practice, label: 'Englisch entdecken' });
  });

  it('suggests a refresh after a few days and names secure stages as badges', () => {
    const p = freshProgress(T0);
    p.lastAnswered = T0;
    p.stages[0].secure = true;
    const s = statsFromProgress(p, T0 + REFRESH_AFTER_MS);
    expect(s.suggestion.priority).toBe(SUGGESTION_PRIORITY.refresh);
    expect(s.badges).toEqual(['Die ersten Farben kennst du auf Englisch schon sicher.']);
  });
});
