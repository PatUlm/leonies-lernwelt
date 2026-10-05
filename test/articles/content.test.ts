import { describe, expect, it } from 'vitest';
import { Engine, freshProgress, type Task } from '../../src/modules/articles/engine';
import { sanitizeProgress } from '../../src/modules/articles/storage';
import { REFRESH_AFTER_MS, statsFromProgress } from '../../src/modules/articles/stats';
import { cardSpeech, confirmation, mistake, storyLines } from '../../src/modules/articles/texts';
import {
  ARTICLES, DISCOVER_NOUNS, NOT_NOUNS, NOUNS, SENTENCES, STORY_INTROS, STORY_KNOWN, STORY_NEW, storyPairFits,
} from '../../src/modules/articles/words';
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

  it('tells a new thing from the same thing again in a story', () => {
    const first = task(4, 't:first:Ball:4:0');
    expect(storyLines(first, '___')).toEqual(['___ Ball ist hier zu sehen.', 'Der Ball gefällt mir.']);
    expect(first.options).toEqual(['Der', 'Ein']);
    expect(confirmation(first)).toBe('Der Ball kommt zum ersten Mal vor: ein Ball.');
    const known = task(4, 't:known:Katze:0:3');
    expect(storyLines(known, '___')).toEqual(['Auf dem Bild ist eine Katze.', 'Mir gefällt ___ Katze.']);
    expect(known.options).toEqual(['die', 'eine']);
    expect(confirmation(known)).toBe('Es ist noch dieselbe Katze. Deshalb heißt es jetzt: die Katze.');
    expect(cardSpeech(known)).toBe('Auf dem Bild ist eine Katze. Mir gefällt Lücke Katze.');
    const joining = task(4, 't:new:Katze:3:0:Hund');
    expect(storyLines(joining, '___')).toEqual(['Ein Hund ist auf dem Bild.', '___ Katze ist auch auf dem Bild.']);
    expect(joining.options[joining.correctIndex]).toBe('Eine');
    expect(confirmation(joining)).toBe('Zuerst war ein Hund da. Jetzt kommt eine Katze dazu.');
  });

  it('builds every story sentence around one gap, half of them with the article first', () => {
    for (const list of [STORY_INTROS, STORY_KNOWN, STORY_NEW]) {
      for (const t of list) expect(t.split('_')).toHaveLength(2);
      expect(list.filter((t) => t.startsWith('_'))).toHaveLength(list.length / 2);
    }
    // Each intro has known sentences that do not repeat its words, at the start and in the middle.
    for (const intro of STORY_INTROS) {
      const fitting = STORY_KNOWN.filter((k) => storyPairFits(intro, k));
      expect(fitting.some((k) => k.startsWith('_'))).toBe(true);
      expect(fitting.some((k) => !k.startsWith('_'))).toBe(true);
    }
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
    expect(fresh.goals).toEqual({ done: 0, total: 4, label: '0 von 4 Lernzielen sicher', sweets: [0, 0, 0, 0] });
    expect(fresh.nextGoal).toBe('Nächstes Ziel: der, die oder das?');

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
