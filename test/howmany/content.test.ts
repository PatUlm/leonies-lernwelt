import { describe, expect, it } from 'vitest';
import { answerText, answerWords, englishTexts, nounOf, questionText, sentenceFile } from '../../src/modules/howmany/content';
import { Engine, EXAMPLES, STAGES, freshProgress, parseKey } from '../../src/modules/howmany/engine';
import { statsFromProgress } from '../../src/modules/howmany/stats';
import { sanitizeProgress } from '../../src/modules/howmany/storage';
import { answer, explanation, help, mistake, plain } from '../../src/modules/howmany/texts';

const T0 = 1_700_000_000_000;
const ghost = nounOf('ghost')!;
const dog = nounOf('dog')!;

describe('how many sentences', () => {
  it('asks and answers as on the worksheet', () => {
    expect(questionText(ghost)).toBe('How many ghosts are there?');
    expect(answerText(1, ghost)).toBe('There is one ghost.');
    expect(answerText(5, ghost)).toBe('There are five ghosts.');
    expect(answerWords(2, dog)).toEqual(['there', 'are', 'two', 'dogs']);
  });

  it('records the nouns, the sentences without a number, the questions and the answers under plain file names', () => {
    const texts = englishTexts();
    expect(texts).toHaveLength(3 * (2 + 2 + 1 + 5));
    expect(texts).toEqual(expect.arrayContaining(['ghosts', 'There is a dog.', 'There are dogs.', 'There is one cat.']));
    expect(sentenceFile('There are two ghosts.')).toBe('there-are-two-ghosts');
    expect(sentenceFile('How many cats are there?')).toBe('how-many-cats-are-there');
    expect(sentenceFile('ghosts')).toBe('ghosts');
    expect(new Set(texts.map(sentenceFile)).size).toBe(texts.length);
    for (const t of texts) expect(sentenceFile(t)).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe('how many texts', () => {
  it('explains one and several in every stage, with the English as its own part', () => {
    const [one, three] = EXAMPLES[1].map((key) => explanation(1, parseKey(key)!));
    expect(plain(one)).toBe('Hier ist nur ein Geist. Auf Englisch heißt das: ghost Bei einem bleibt das s weg. Tippe das Kärtchen an, das leuchtet.');
    expect(plain(three)).toContain('Hier sind drei Geister.');
    expect(plain(explanation(2, parseKey(EXAMPLES[2][0])!))).toBe('Hier ist nur ein Hund. Bei einem heißt es „is“: There is a dog. Tippe das Kärtchen an, das leuchtet.');
    expect(explanation(2, parseKey(EXAMPLES[2][1])!)).toContainEqual({ en: 'There are dogs.' });
    expect(explanation(3, parseKey(EXAMPLES[3][0])!)).toContainEqual({ en: 'There is one ghost.' });
    for (const stage of STAGES) {
      for (const key of EXAMPLES[stage]) expect(explanation(stage, parseKey(key)!).filter((p) => typeof p !== 'string')).toHaveLength(1);
    }
  });

  it('plays the word in stage 1 and the sentence otherwise', () => {
    expect(answer(1, { count: 3, noun: dog })).toEqual([{ en: 'dogs' }]);
    expect(answer(2, { count: 3, noun: dog })).toEqual([{ en: 'There are dogs.' }]);
    expect(answer(3, { count: 3, noun: dog })).toEqual([{ en: 'There are three dogs.' }]);
  });

  it('helps with the place that is open and explains a wrong card', () => {
    expect(help('verb', true)).toBe('Es ist nur eins: Dann heißt es „is“.');
    expect(help('noun', false)).toBe('Es sind mehrere: Dann kommt ein s dazu.');
    expect(plain(mistake(1, { count: 1, noun: ghost }))).toBe('Schau genau: Es ist nur eins. Bei einem bleibt das s weg. ghost');
    expect(plain(mistake(2, { count: 4, noun: dog }))).toBe('Schau genau: Es sind mehrere. Bei mehreren heißt es „are“. There are dogs.');
  });
});

describe('how many progress', () => {
  it('keeps valid fields from another device and drops broken ones', () => {
    const engine = new Engine(freshProgress(T0));
    engine.progress.reviewQueue = [{ stage: 1, key: 'ghost:2', dueAt: 3 }];
    const raw = JSON.parse(JSON.stringify(engine.progress));
    raw.reviewQueue.push({ stage: 1, key: 'mouse:2', dueAt: 1 }, { stage: 9, key: 'ghost:1', dueAt: 1 });
    raw.stages[0].window = [{ ok: true, count: 2, noun: 'cat' }, { ok: true, count: 7, noun: 'cat' }];
    raw.forced.push({ type: 'example', stage: 2 });
    const p = sanitizeProgress(raw, T0);
    expect(p.reviewQueue).toEqual([{ stage: 1, key: 'ghost:2', dueAt: 3 }]);
    expect(p.stages[0].window).toEqual([{ ok: true, count: 2, noun: 'cat' }]);
    expect(p.forced).toEqual(freshProgress(T0).forced);
    expect(sanitizeProgress({ version: 3 }, T0)).toEqual(freshProgress(T0));
  });

  it('starts the rebuilt stages again from version 1 and keeps stars, trophies and points', () => {
    const old = {
      version: 1, session: 3, lastActive: T0, lastAnswered: T0, taskCounter: 40, points: 300, correctTotal: 25, trophies: 2,
      stages: [{ unlocked: true, mastery: 100, ready: true }, { unlocked: true, mastery: 30 }, { unlocked: false }],
      reviewQueue: [{ stage: 2, key: 'dog:3', dueAt: 41 }], forced: [], recent: ['dog:3'],
      round: { tasks: 4, points: 40, correct: 4 },
    };
    const p = sanitizeProgress(old, T0);
    expect(p).toMatchObject({ version: 2, points: 300, correctTotal: 25, trophies: 2, taskCounter: 40, news: true });
    expect(p.stages).toEqual(freshProgress(T0).stages);
    expect(p.forced).toEqual(freshProgress(T0).forced);
    expect(p.reviewQueue).toEqual([]);
    expect(p.round).toEqual({ tasks: 0, points: 0, correct: 0 });
    expect(new Engine(p).stars).toBe(5);
  });

  it('invites to discover the module on first start', () => {
    const stats = statsFromProgress(freshProgress(T0), T0);
    expect(stats.started).toBe(false);
    expect(stats.suggestion.label).toBe('Englische Sätze entdecken');
    expect(stats.goals.total).toBe(3);
    expect(stats.nextGoal).toBe('Nächstes Ziel: Eins oder mehrere');
  });
});
