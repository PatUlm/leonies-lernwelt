import { describe, expect, it } from 'vitest';
import { germanTexts } from '../../scripts/german-texts';
import { Engine, EXAMPLES, STAGES, freshProgress, type Stage, type Task } from '../../src/modules/notes/engine';
import { statsFromProgress } from '../../src/modules/notes/stats';
import { sanitizeProgress } from '../../src/modules/notes/storage';
import { confirmation, explanation, help, mistake, question } from '../../src/modules/notes/texts';
import { spokenGerman } from '../../src/shared/spoken';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;

function taskOf(stage: Stage, key: string): Task {
  return new Engine(freshProgress(T0), seeded(1)).makeTask(stage, 'practice', key)!;
}

describe('notes texts', () => {
  it('explains the examples with the length in beats', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    const [quarter, eighth] = EXAMPLES[1].map((key) => explanation(engine.makeTask(1, 'example', key)!).join(' '));
    expect(quarter).toBe('Ausgemalt, mit Hals, ohne Fähnchen: Das ist eine Viertelnote. Die Viertelnote dauert einen Schlag. Ein Feld ist ein Schlag. Die richtige Antwort ist …');
    expect(eighth).toContain('Zwei Achtel passen in einen Schlag.');
    expect(explanation(engine.makeTask(4, 'example', 'qq_')!).join(' ')).toBe(
      'In einen Takt passen vier Schläge. Hier sind schon zwei Schläge. Es fehlen zwei Schläge: die halbe Note. Die richtige Antwort ist …',
    );
  });

  it('says why a wrong answer does not fit', () => {
    const group: Task = { ...taskOf(2, 'h:qq'), options: [['q', 'q'], ['h', 'q'], ['e', 'e']], correctIndex: 0 };
    expect(mistake(group, 1)).toEqual(['Schauen wir zusammen.', 'Diese Noten dauern zusammen drei Schläge.', 'Die halbe Note dauert zwei Schläge.']);
    expect(mistake(group, 2)[1]).toBe('Diese Noten dauern zusammen einen Schlag.');

    const bar: Task = { ...taskOf(4, 'hq_'), options: [['q'], ['h'], ['e']], correctIndex: 0 };
    expect(mistake(bar, 1)).toEqual([
      'Schauen wir zusammen.', 'Das wären fünf Schläge.', 'In einen Takt passen vier Schläge.', 'Es fehlt ein Schlag: die Viertelnote.',
    ]);
    expect(mistake(bar, 2)[1]).toBe('Das sind erst dreieinhalb Schläge.');
    const short: Task = { ...taskOf(4, 'qq_'), options: [['h'], ['e'], ['w']], correctIndex: 0 };
    expect([mistake(short, 1)[1], mistake(short, 2)[1]]).toEqual(['Das sind erst zweieinhalb Schläge.', 'Das wären sechs Schläge.']);
  });

  it('has every sentence a task can say in the recordings', () => {
    const recorded = new Set(germanTexts().map((t) => t.text));
    const engine = new Engine(freshProgress(T0), seeded(2));
    const seen = new Set<string>();
    for (let i = 0; i < 1500; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      const parts = [
        ...question(t), ...help(t), ...(t.kind === 'example' ? explanation(t) : []),
        ...t.options.flatMap((_, j) => (j === t.correctIndex ? [] : mistake(t, j))),
        ...['Richtig!', 'Genau!', 'Gemeinsam geschafft!'].flatMap((lead) => confirmation(lead, t)),
      ];
      for (const part of parts) seen.add(spokenGerman(part));
      engine.answer(t, t.correctIndex, false);
    }
    expect(STAGES.every((s) => engine.stageState(s).unlocked)).toBe(true);
    expect([...seen].filter((s) => !recorded.has(s))).toEqual([]);
  });
});

describe('notes progress', () => {
  it('keeps valid fields from another device and drops broken ones', () => {
    const p = sanitizeProgress({
      version: 1,
      points: 40,
      trophies: 2,
      stages: [{ unlocked: true, mastery: 999, window: [{ ok: true, value: 'q' }, { ok: true, value: 'x' }] }, { unlocked: true }],
      reviewQueue: [{ stage: 2, key: 'h:eeq', dueAt: 3 }, { stage: 2, key: 'h:q', dueAt: 3 }, { stage: 4, key: 'w_', dueAt: 1 }],
      forced: [{ type: 'example', stage: 4, pick: 1 }, { type: 'example', stage: 4, pick: 9 }, { type: 'example', stage: 2 }],
      recent: ['4:x', 'q', '1:q', '2:h:qq'],
    }, T0);
    expect(p.points).toBe(40);
    expect(p.trophies).toBe(2);
    expect(p.stages[0].mastery).toBe(160);
    expect(p.stages[0].window).toEqual([{ ok: true, value: 'q' }]);
    expect(p.stages[1].unlocked).toBe(true);
    expect(p.stages[2].unlocked).toBe(false);
    expect(p.reviewQueue).toEqual([{ stage: 2, key: 'h:eeq', dueAt: 3 }]);
    expect(p.forced).toEqual([{ type: 'example', stage: 4, pick: 1 }, { type: 'example', stage: 2 }]);
    expect(p.recent).toEqual(['1:q', '2:h:qq']);
    expect(sanitizeProgress({ version: 2 }, T0)).toEqual(freshProgress(T0));
  });

  it('suggests discovering the module before the first answer', () => {
    const stats = statsFromProgress(freshProgress(T0), T0);
    expect(stats.started).toBe(false);
    expect(stats.suggestion.label).toBe('Notenwerte entdecken');
    expect(stats.goals).toMatchObject({ done: 0, total: 4 });
    expect(stats.nextGoal).toBe('Nächstes Ziel: Wie lange dauert die Note?');
  });
});
