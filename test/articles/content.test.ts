import { describe, expect, it } from 'vitest';
import { Engine, freshProgress, type Task } from '../../src/modules/articles/engine';
import { sanitizeProgress } from '../../src/modules/articles/storage';
import { REFRESH_AFTER_MS, statsFromProgress } from '../../src/modules/articles/stats';
import { cardSpeech, confirmation, mistake, storyLines } from '../../src/modules/articles/texts';
import { ARTICLES, DISCOVER_NOUNS, NOT_NOUNS, NOUNS, SENTENCES } from '../../src/modules/articles/words';
import { SUGGESTION_PRIORITY } from '../../src/modules/types';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;

function task(stage: 1 | 2 | 3 | 4, key: string): Task {
  return new Engine(freshProgress(T0), seeded(1)).makeTask(stage, 'practice', key)!;
}

describe('word lists', () => {
  it('has as many nouns for der as for die and das, each word once', () => {
    for (const a of ARTICLES) expect(NOUNS.filter((n) => n.article === a)).toHaveLength(12);
    expect(new Set(NOUNS.map((n) => n.word)).size).toBe(NOUNS.length);
    expect(new Set(DISCOVER_NOUNS.map((n) => n.word)).size).toBe(DISCOVER_NOUNS.length);
  });

  it('keeps words that are no nouns small and apart from the nouns', () => {
    const nouns = new Set([...NOUNS, ...DISCOVER_NOUNS].map((n) => n.word.toLowerCase()));
    for (const w of NOT_NOUNS) {
      expect(w).toBe(w.toLowerCase());
      expect(nouns.has(w)).toBe(false);
    }
  });

  it('has exactly one capitalised word besides the first in each sentence: the noun', () => {
    for (const s of SENTENCES) {
      const capitalised = s.words.map((w, i) => (i > 0 && /^[A-ZÄÖÜ]/.test(w) ? i : -1)).filter((i) => i >= 0);
      expect(capitalised.length ? capitalised : [s.noun]).toEqual([s.noun]);
      expect(s.words.join(' ')).not.toContain('ß');
    }
  });
});

describe('texts', () => {
  it('says article and noun together', () => {
    expect(confirmation(task(1, 'Apfel'))).toBe('Der Apfel.');
    expect(confirmation(task(2, 'Katze'))).toBe('Die Katze – eine Katze.');
    expect(mistake(task(2, 'Ei'))).toBe('Es heißt das Ei, also ein Ei. Aus der und das wird ein, aus die wird eine.');
  });

  it('explains why a word is or is not a noun', () => {
    expect(confirmation(task(3, 'w:Tisch'))).toBe('Der Tisch – TISCH ist ein Nomen.');
    expect(mistake(task(3, 'w:weich'))).toBe('„der weich“, „die weich“, „das weich“ – das passt nicht. WEICH ist kein Nomen.');
  });

  it('tells first mention from a known thing in a story', () => {
    const first = task(4, 't:Ball:0:0:0');
    expect(storyLines(first, '___')).toEqual(['Schau, da ist ___ Ball.', 'Der Ball ist schön.']);
    expect(confirmation(first)).toBe('Der Ball kommt zum ersten Mal vor: ein Ball.');
    const known = task(4, 't:Ball:1:1:1');
    expect(storyLines(known, '___')).toEqual(['Hier ist ein Ball.', '___ Ball gefällt mir.']);
    expect(confirmation(known)).toBe('Den Ball kennen wir schon: der Ball.');
    expect(cardSpeech(known)).toBe('Hier ist ein Ball. Lücke Ball gefällt mir.');
  });
});

describe('stored progress', () => {
  it('survives a round trip and rejects foreign values', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    for (let i = 0; i < 12; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      engine.answer(t, t.correctIndex, false);
    }
    const copy = sanitizeProgress(JSON.parse(JSON.stringify(engine.progress)), T0);
    expect(copy).toEqual(engine.progress);

    const broken = sanitizeProgress(
      {
        version: 1,
        stages: [{ unlocked: true, mastery: '<b>', window: [{ ok: true, word: 7 }] }, 'x'],
        reviewQueue: [{ stage: 9, key: 'Apfel' }, { stage: 1, key: 'Apfel', dueAt: 3 }],
        forced: [{ type: 'example', stage: '1' }],
        round: { tasks: -4 },
      },
      T0,
    );
    expect(broken.stages[0]).toMatchObject({ unlocked: true, mastery: 0, window: [] });
    expect(broken.stages[1].unlocked).toBe(false);
    expect(broken.reviewQueue).toEqual([{ stage: 1, key: 'Apfel', dueAt: 3 }]);
    expect(broken.forced).toEqual([]);
    expect(broken.round.tasks).toBe(0);
  });
});

describe('stats', () => {
  it('invites to discover the module, then to continue the round, then to refresh', () => {
    const fresh = statsFromProgress(freshProgress(T0), T0);
    expect(fresh.suggestion).toEqual({ priority: SUGGESTION_PRIORITY.practice, label: 'Artikel entdecken' });
    expect(fresh.goals).toEqual({ done: 0, total: 4, label: '0 von 4 Stufen sicher' });

    const engine = new Engine(freshProgress(T0), seeded(3));
    for (let i = 0; i < 5; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      engine.answer(t, t.correctIndex, false);
    }
    const playing = statsFromProgress(engine.progress, T0);
    expect(playing.round).toEqual({ done: 3, target: 10, unit: 'Aufgaben' });
    expect(playing.suggestion.priority).toBe(SUGGESTION_PRIORITY.continueRound);

    engine.progress.round.tasks = 0;
    expect(statsFromProgress(engine.progress, T0 + REFRESH_AFTER_MS).suggestion.label).toBe('Artikel auffrischen');
  });
});
