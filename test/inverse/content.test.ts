import { describe, expect, it } from 'vitest';
import { Engine, MAX_MASTERY, STAGES, diagnose, formOf, freshProgress, stepsOf, type Problem, type Stage, type Step } from '../../src/modules/inverse/engine';
import { statsFromProgress } from '../../src/modules/inverse/stats';
import { sanitizeProgress } from '../../src/modules/inverse/storage';
import { chooseExample, confirmation, crossesTen, exampleText, gapTaskText, help, inverseOptions, termsText } from '../../src/modules/inverse/texts';
import { spokenGerman } from '../../src/shared/spoken';

const T0 = 1_700_000_000_000;
const front = (total: number, part: number): Problem => ({ total, part, shape: 'front' });
const step = (kind: Step['kind'], terms: number[], result: number, later?: number): Step => ({ kind, terms, op: kind === 'probe' ? '+' : '−', result, later });

describe('inverse lines', () => {
  it('writes two lines, one line or the inverse directly, with the check sum if asked', () => {
    const p = front(90, 23);
    expect(stepsOf({ form: 1, problem: p, probe: false }).map(termsText)).toEqual(['90 − 20', '70 − 3']);
    expect(stepsOf({ form: 2, problem: p, probe: false }).map(termsText)).toEqual(['90 − 20 − 3']);
    expect(stepsOf({ form: 3, problem: p, probe: true }).map((s) => `${termsText(s)} = ${s.result}`)).toEqual(['90 − 23 = 67', '67 + 23 = 90']);
    // Help brings back the two lines.
    expect(stepsOf({ form: 3, problem: p, probe: false }, true).map((s) => s.kind)).toEqual(['tens', 'ones']);
    // The moved gap keeps the order of the task in the check sum.
    expect(stepsOf({ form: 3, problem: { ...p, shape: 'back' }, probe: true })[1].terms).toEqual([23, 67]);
  });

  it('writes the gap task, its inverse and the filled task', () => {
    expect(gapTaskText(front(90, 23))).toBe('__ + 23 = 90');
    expect(gapTaskText({ total: 90, part: 23, shape: 'back' })).toBe('23 + __ = 90');
    expect(inverseOptions(front(90, 23))).toEqual(['90 − 23', '90 + 23']);
    expect(confirmation(front(90, 23))).toBe('67 + 23 = 90.');
  });
});

describe('diagnose', () => {
  it('finds the ones taken first in the tens line', () => {
    const tens = step('tens', [90, 20], 70, 3);
    expect(diagnose(tens, 87)).toBe('order');
    expect(diagnose(tens, 67)).toBe('order');
    expect(diagnose(tens, 110)).toBe('added');
    expect(diagnose(tens, 60)).toBe('again');
  });

  it('finds adding and the forgotten ten in the ones line', () => {
    expect(diagnose(step('ones', [70, 3], 67), 73)).toBe('added');
    expect(diagnose(step('ones', [70, 3], 67), 77)).toBe('tensKept');
    expect(diagnose(step('ones', [63, 7], 56), 64)).toBe('toTen');
    expect(diagnose(step('ones', [63, 7], 56), 66)).toBe('tensKept');
    expect(diagnose(step('ones', [63, 7], 56), 70)).toBe('added');
    expect(diagnose(step('ones', [63, 7], 56), 55)).toBe('again');
  });

  it('finds a missing part in one line or directly', () => {
    expect(diagnose(step('line', [90, 20, 3], 67), 70)).toBe('both');
    expect(diagnose(step('line', [90, 20, 3], 67), 87)).toBe('both');
    expect(diagnose(step('line', [90, 20, 3], 67), 113)).toBe('added');
    expect(diagnose(step('direct', [93, 27], 66), 74)).toBe('toTen');
    expect(diagnose(step('direct', [93, 27], 66), 76)).toBe('tensKept');
    expect(diagnose(step('direct', [93, 27], 66), 65)).toBe('again');
    expect(diagnose(step('probe', [67, 23], 90), 80)).toBe('probe');
  });

  it('gives the help to the ten only where the ones line crosses it', () => {
    expect(crossesTen(step('ones', [76, 3], 73))).toBe(false);
    expect(crossesTen(step('ones', [73, 7], 66))).toBe(true);
    expect(help(step('ones', [73, 7], 66))).toContain('bis zum Zehner');
    // From a round ten there is no ten to reach first.
    expect(help(step('ones', [70, 3], 67))).toContain('schon auf einem glatten Zehner');
    expect(help(step('ones', [76, 3], 73))).toBe('Jetzt fehlen nur noch die Einer. Ziehe sie ab.');
  });
});

describe('inverse examples', () => {
  /** The example messages of a task, one per line. */
  const lines = (stage: Stage, p: Problem, probe = false) =>
    stepsOf({ form: formOf(stage), problem: p, probe }).map((s) => exampleText(stage, p, s));

  it('explain line by line in words the speech reads well', () => {
    expect(lines(1, front(96, 23))).toEqual([
      'Die Umkehraufgabe rechnet rückwärts: 96 − 23. Zuerst die Zehner: 96 − 20 = 76. Tippe die Zahl ab, die leuchtet.',
      'Dann die Einer: 76 − 3 = 73. Tippe die Zahl ab, die leuchtet.',
    ]);
    expect(spokenGerman(lines(3, front(93, 27))[1])).toBe('Für 73 minus 7 gehen wir erst 3 zurück bis 70, dann noch 4: 66. Tippe die Zahl ab, die leuchtet.');
    expect(lines(2, front(100, 34))).toEqual([
      '100 sind zehn Zehner. Wir nehmen drei Zehner weg: 100 − 30 = 70. Tippe die Zahl ab, die leuchtet.',
      'Jetzt noch 4 zurück: 70 − 4 = 66. Tippe die Zahl ab, die leuchtet.',
    ]);
    expect(lines(6, front(93, 27))).toEqual(['Jetzt in einer Zeile: 93 − 20 − 7. Erst 20 zurück bis 73, dann 3 bis 70 und noch 4: 66. Tippe die Zahl ab, die leuchtet.']);
    expect(lines(8, front(90, 23))).toEqual(['Jetzt direkt vom glatten Zehner: 90 − 23. Im Kopf erst 20 zurück bis 70, dann 3 zurück bis 67. Tippe die Zahl ab, die leuchtet.']);
    expect(lines(7, front(96, 23), true)[1]).toBe('Mit der Probe prüfen wir die gefundene Zahl. 73 + 23 ergibt wieder 96. Tippe die Zahl ab, die leuchtet.');
    expect(chooseExample(front(96, 23))).toBe('Wir suchen die fehlende Zahl zur Plusaufgabe. Dafür rechnen wir rückwärts: 96 − 23. Tippe auf die Aufgabe, die leuchtet.');
  });

  it('keep every line to two short sentences before what to type, and never say "neu"', () => {
    for (const stage of STAGES) {
      for (const p of [front(96, 23), front(90, 23), front(100, 34), front(93, 27)]) {
        for (const text of lines(stage, p, formOf(stage) === 3)) {
          const said = text.replace(' Tippe die Zahl ab, die leuchtet.', '');
          expect(said.split(/[.!?](?:\s|$)/).filter(Boolean).length, said).toBeLessThanOrEqual(2);
          expect(said).not.toMatch(/Gesucht|neu/i);
        }
      }
    }
  });
});

describe('inverse stats', () => {
  it('shows nine goals and one sweet per way of writing', () => {
    const p = freshProgress(T0);
    for (const s of [1, 2, 3, 4] as const) p.stages[s - 1].secure = true;
    const stats = statsFromProgress(p, T0);
    expect(stats.goals).toMatchObject({ done: 4, total: 9, label: '4 von 9 Lernzielen sicher' });
    expect(stats.goals.sweets).toEqual([1, 1 / 3, 0]);
    expect(stats.badges[0]).toBe('Umkehraufgaben in zwei Schritten ohne Zehnerübergang rechnest du schon sicher.');
    expect(stats.suggestion.label).toBe('Umkehraufgaben entdecken');
  });
});

describe('inverse progress storage', () => {
  it('starts fresh from anything unknown', () => {
    expect(sanitizeProgress(null, T0)).toEqual(freshProgress(T0));
    expect(sanitizeProgress({ version: 2 }, T0)).toEqual(freshProgress(T0));
  });

  it('keeps a progress of the six-task version and goes on under the ten-task rule', () => {
    // Written by 2026.10.7/8: windows of eight, mastery up to 120, stage 3 being learnt.
    const old = freshProgress(T0);
    const window = (ok: boolean) => [[96, 23], [78, 45], [95, 41], [69, 55], [97, 26], [63, 51], [78, 21], [65, 54]].map(([total, part]) => ({ ok, total, part }));
    Object.assign(old.stages[0], { unlocked: true, attempts: 14, window: window(true), mastery: 120, ready: true, readySession: 1, secure: true });
    Object.assign(old.stages[1], { unlocked: true, attempts: 8, window: window(true).map((a) => ({ ...a, total: 90, part: 23 })), mastery: 60, ready: true, readySession: 1 });
    Object.assign(old.stages[2], { unlocked: true, attempts: 3, mastery: 30 });
    old.forced = [];
    const p = sanitizeProgress(JSON.parse(JSON.stringify(old)), T0);
    expect(p.stages.slice(0, 3).map((s) => [s.unlocked, s.ready, s.secure, s.mastery])).toEqual([[true, true, true, 120], [true, true, false, 60], [true, false, false, 30]]);
    expect(p.stages[0].window).toHaveLength(8);

    const engine = new Engine(p);
    for (let i = 0; i < 300 && !engine.stageState(4).unlocked; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      engine.answer(t, { mistake: false, helped: false, helpFirst: false, shown: false });
    }
    // Stage 3 needs the full ten now: from 30 to at least 100.
    expect(engine.stageState(3).mastery).toBeGreaterThanOrEqual(100);
    expect(engine.stageState(4).unlocked).toBe(true);
    expect(engine.stageState(1).secure).toBe(true);
    expect(engine.stageState(3).window.length).toBeLessThanOrEqual(10);
  });

  it('keeps a valid progress and drops broken entries', () => {
    const engine = new Engine(freshProgress(T0));
    engine.touch(T0);
    engine.answer(engine.nextTask(), { mistake: false, helped: false, helpFirst: false, shown: false });
    const raw = JSON.parse(JSON.stringify(engine.progress));
    expect(sanitizeProgress(raw, T0)).toEqual(engine.progress);

    raw.stages[0].window = [{ ok: true, total: 90, part: 30 }, { ok: true, total: 90, part: 23 }];
    raw.forced = [{ type: 'example', stage: 12 }, { type: 'back' }, { type: 'easy', stage: 3 }];
    raw.recent = [90, 'x', 400];
    raw.stages[1].mastery = 9999;
    const clean = sanitizeProgress(raw, T0);
    expect(clean.stages[0].window).toEqual([{ ok: true, total: 90, part: 23 }]);
    expect(clean.forced).toEqual([{ type: 'back' }, { type: 'easy', stage: 3 }]);
    expect(clean.recent).toEqual([90]);
    expect(clean.stages[1].mastery).toBe(MAX_MASTERY);
    expect(clean.stages).toHaveLength(STAGES.length);
  });
});
