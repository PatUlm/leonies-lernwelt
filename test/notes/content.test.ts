import { describe, expect, it } from 'vitest';
import { germanTexts } from '../../scripts/german-texts';
import { Engine, STAGES, exampleKeys, freshProgress, type Stage, type Task } from '../../src/modules/notes/engine';
import { statsFromProgress } from '../../src/modules/notes/stats';
import { sanitizeProgress } from '../../src/modules/notes/storage';
import { PRAISE, confirmation, explanation, help, mistake, question } from '../../src/modules/notes/texts';
import { ANSWER_FOLLOWS } from '../../src/shared/game/texts';
import { spokenGerman } from '../../src/shared/spoken';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;

function taskOf(stage: Stage, key: string): Task {
  return new Engine(freshProgress(T0), seeded(1)).makeTask(stage, 'practice', key)!;
}

describe('notes texts', () => {
  it('explains every example in at most two short sentences before the answer', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    for (const stage of STAGES) {
      for (const key of exampleKeys(stage)) {
        const text = explanation(engine.makeTask(stage, 'example', key)!);
        expect(text).toHaveLength(3);
        expect(text[2]).toBe(ANSWER_FOLLOWS);
      }
    }
    expect(explanation(engine.makeTask(1, 'example', 'q')!).join(' ')).toBe(
      'Ausgemalt, ohne Fähnchen: die Viertelnote. Die Viertelnote dauert einen Schlag. Die richtige Antwort ist …',
    );
    expect(explanation(engine.makeTask(3, 'example', '_')!).join(' ')).toBe(
      'Zusammen sollen es zwei Schläge sein. Beide Schläge fehlen noch. Die richtige Antwort ist …',
    );
  });

  it('says why a wrong answer does not fit', () => {
    const length: Task = { ...taskOf(2, 'h'), options: ['h', 'q', 'e'], correctIndex: 0 };
    expect(mistake(length, 1)).toEqual(['Die Viertelnote dauert einen Schlag.', 'Die halbe Note dauert zwei Schläge.']);

    const row: Task = { ...taskOf(3, 'q_'), options: ['q', 'h', 'e'], correctIndex: 0 };
    expect(mistake(row, 1)).toEqual(['Damit werden es mehr als zwei Schläge.', 'Es fehlt ein Schlag: die Viertelnote.']);
    expect(mistake(row, 2)[0]).toBe('Damit sind die zwei Schläge noch nicht voll.');
    const empty: Task = { ...taskOf(3, '_'), options: ['h', 'q', 'e'], correctIndex: 0 };
    expect(mistake(empty, 1)).toEqual(['Damit sind die zwei Schläge noch nicht voll.', 'Es fehlen zwei Schläge: die halbe Note.']);
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
        ...[...PRAISE, 'Gemeinsam geschafft!'].flatMap((lead) => confirmation(lead, t)),
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
      version: 2,
      points: 40,
      trophies: 2,
      stages: [{ unlocked: true, steps: 9, mastery: 999, window: [{ ok: true, value: 'q' }, { ok: true, value: 'w' }] }, { unlocked: true }],
      reviewQueue: [{ stage: 3, key: 'qe_', dueAt: 3 }, { stage: 3, key: 'q', dueAt: 3 }, { stage: 1, key: 'w', dueAt: 1 }],
      forced: [{ type: 'example', stage: 3, pick: 2 }, { type: 'example', stage: 3, pick: 3 }, { type: 'example', stage: 2 }],
      recent: ['3:x', 'q', '1:q', '3:_'],
    }, T0);
    expect(p.points).toBe(40);
    expect(p.trophies).toBe(2);
    expect(p.stages[0]).toMatchObject({ steps: 2, mastery: 160, window: [{ ok: true, value: 'q' }] });
    expect(p.stages[1]).toMatchObject({ unlocked: true, steps: 1 });
    expect(p.stages[2]).toMatchObject({ unlocked: false, steps: 0 });
    expect(p.reviewQueue).toEqual([{ stage: 3, key: 'qe_', dueAt: 3 }]);
    expect(p.forced).toEqual([{ type: 'example', stage: 3, pick: 2 }, { type: 'example', stage: 2 }]);
    expect(p.recent).toEqual(['1:q', '3:_']);
    expect(sanitizeProgress({ version: 3 }, T0)).toEqual(freshProgress(T0));
  });

  it('starts the learning, round and streaks of version 1 anew and keeps points, stars and trophies', () => {
    const p = sanitizeProgress({
      version: 1,
      points: 120,
      correctTotal: 12,
      trophies: 1,
      round: { tasks: 9, points: 80, correct: 8 },
      wrongStreak: 2,
      correctStreak: 5,
      stages: [{ unlocked: true, mastery: 100, ready: true }, { unlocked: true }, { unlocked: true }, { unlocked: true }],
      reviewQueue: [{ stage: 2, key: 'h', dueAt: 1 }],
      forced: [{ type: 'example', stage: 4, pick: 0 }],
      recent: ['1:q'],
    }, T0);
    expect(p).toMatchObject({
      version: 2, points: 120, correctTotal: 12, trophies: 1, reviewQueue: [], recent: [], wrongStreak: 0, correctStreak: 0,
      round: { tasks: 0, points: 0, correct: 0 },
    });
    expect(p.stages).toEqual(freshProgress(T0).stages);
    expect(p.forced).toEqual(freshProgress(T0).forced);
  });

  it('suggests discovering the module before the first answer', () => {
    const stats = statsFromProgress(freshProgress(T0), T0);
    expect(stats.started).toBe(false);
    expect(stats.suggestion.label).toBe('Notenwerte entdecken');
    expect(stats.goals).toMatchObject({ done: 0, total: 3 });
    expect(stats.nextGoal).toBe('Nächstes Ziel: Wie lange dauert die Note?');
  });
});
