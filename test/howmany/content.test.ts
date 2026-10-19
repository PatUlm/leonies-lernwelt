import { describe, expect, it } from 'vitest';
import { answerText, answerWords, englishSentences, nounOf, questionText, sentenceFile } from '../../src/modules/howmany/content';
import { Engine, EXAMPLES, STAGES, freshProgress, parseKey } from '../../src/modules/howmany/engine';
import { statsFromProgress } from '../../src/modules/howmany/stats';
import { sanitizeProgress } from '../../src/modules/howmany/storage';
import { explanation, help, plain } from '../../src/modules/howmany/texts';

const T0 = 1_700_000_000_000;
const ghost = nounOf('ghost')!;

describe('how many sentences', () => {
  it('asks and answers as on the worksheet', () => {
    expect(questionText(ghost)).toBe('How many ghosts are there?');
    expect(answerText(1, ghost)).toBe('There is one ghost.');
    expect(answerText(5, ghost)).toBe('There are five ghosts.');
    expect(answerWords(2, nounOf('dog')!)).toEqual(['there', 'are', 'two', 'dogs']);
  });

  it('records three questions and fifteen answers under plain file names', () => {
    const sentences = englishSentences();
    expect(sentences).toHaveLength(18);
    expect(sentenceFile('There are two ghosts.')).toBe('there-are-two-ghosts');
    expect(sentenceFile('How many cats are there?')).toBe('how-many-cats-are-there');
    expect(new Set(sentences.map(sentenceFile)).size).toBe(18);
    for (const s of sentences) expect(sentenceFile(s)).toMatch(/^[a-z]+(-[a-z]+)+$/);
  });
});

describe('how many texts', () => {
  it('explains one ghost and several ghosts with the English sentence as its own part', () => {
    const one = explanation(1, parseKey(EXAMPLES[1][0])!);
    expect(one).toContainEqual({ en: 'There is one ghost.' });
    expect(plain(one)).toBe('Hier ist nur ein Geist. Dann sagt man: There is one ghost. Bei einem bleibt das s weg. Tippe die Kärtchen an, die leuchten.');
    expect(plain(explanation(1, parseKey(EXAMPLES[1][1])!))).toContain('Hier sind drei Geister.');
    for (const stage of STAGES) {
      for (const key of EXAMPLES[stage]) expect(explanation(stage, parseKey(key)!).filter((p) => typeof p !== 'string')).toHaveLength(1);
    }
  });

  it('helps with the place that is open', () => {
    expect(help(1, { count: 1, noun: ghost })).toBe('Es ist nur eins: Dann heißt es „is“.');
    expect(help(3, { count: 4, noun: ghost })).toBe('Es sind mehrere: Dann kommt ein s dazu.');
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
    expect(sanitizeProgress({ version: 2 }, T0)).toEqual(freshProgress(T0));
  });

  it('invites to discover the module on first start', () => {
    const stats = statsFromProgress(freshProgress(T0), T0);
    expect(stats.started).toBe(false);
    expect(stats.suggestion.label).toBe('Englische Sätze entdecken');
    expect(stats.goals.total).toBe(3);
    expect(stats.nextGoal).toBe('Nächstes Ziel: ghost oder ghosts');
  });
});
