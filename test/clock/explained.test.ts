import { describe, expect, it } from 'vitest';
import type { DayContext } from '../../src/modules/clock/daytime';
import { Engine, freshProgress, type Task } from '../../src/modules/clock/engine';
import { explainExample, helpText } from '../../src/modules/clock/hints';
import { sanitizeProgress } from '../../src/modules/clock/storage';
import { seeded } from '../rng';
import { answerTask } from './answer';

const T0 = 1_700_000_000_000;

/** Plays rightly until every time-of-day tier is ready, or `n` tasks. */
function playAll(seed: number, n: number): Task[] {
  const engine = new Engine(freshProgress(T0), seeded(seed));
  const tasks: Task[] = [];
  for (let i = 0; i < n && !engine.tierState('dayInput', 3).ready; i++) {
    engine.touch(T0);
    const t = engine.nextTask();
    tasks.push(t);
    answerTask(engine, t, true, false, 3000);
  }
  return tasks;
}

describe('only what was explained is asked: the clock', () => {
  it('asks a time of day in a track only after its example there: reading, setting, typing', () => {
    const tasks = playAll(51, 12_000);
    const explaining = (t: Task) => Engine.dayTrackOf(t.track);
    const seen = new Set<string>();
    const contexts = new Set<DayContext>();
    for (const t of tasks) {
      if (!t.context) continue;
      const key = `${explaining(t)}:${t.context}`;
      if (t.kind === 'example') seen.add(key);
      else expect(seen.has(key), `${t.track} ${t.context} before its example`).toBe(true);
      contexts.add(t.context);
    }
    expect(contexts.size).toBe(5);
  });

  it('starts the words of tiers 4 and 5 with "zwanzig vor" and "fünfundzwanzig vor", typing with a four-digit time', () => {
    const tasks = playAll(52, 12_000).filter((t) => t.kind === 'example');
    const intro = (track: Task['track'], tier: number) => tasks.filter((t) => t.track === track && t.tier === tier).map((t) => `${t.time.hour}:${t.time.minute}`);
    expect(intro('text', 4).slice(0, 3)).toEqual(['3:10', '7:50', '12:40']);
    expect(intro('text', 5).slice(0, 3)).toEqual(['3:5', '7:55', '12:35']);
    expect(intro('input', 1).slice(0, 2)).toEqual(['3:0', '12:0']);
  });

  it('explains in at most two short sentences', () => {
    expect(explainExample({ track: 'digital', time: { hour: 7, minute: 50 } })).toBe(
      'Zähle in Fünferschritten bis zum langen Zeiger: 50 Minuten. Der kurze Zeiger ist noch nicht bei der 8: Es ist 7:50 Uhr.',
    );
    expect(explainExample({ track: 'digital', time: { hour: 12, minute: 1 } })).toBe(
      'Der lange Zeiger steht einen Strich nach der 12: eine Minute. Der kurze Zeiger ist gerade an der 12 vorbei: Es ist 12:01 Uhr.',
    );
    expect(explainExample({ track: 'daytime', time: { hour: 7, minute: 30 }, context: 'evening' })).toBe(
      'Nach zwölf Uhr mittags zählen wir weiter: 7:30 Uhr am Abend ist 19:30 Uhr.',
    );
    expect(explainExample({ track: 'daytime', time: { hour: 12, minute: 15 }, context: 'night' })).toBe(
      'Nach Mitternacht beginnt der Tag bei null: 12:15 Uhr in der Nacht ist 0:15 Uhr.',
    );
    expect(helpText({ track: 'daySet', mode: 'set', context: 'night', hourOnly: false }, '').spoken).toBe(
      'Bei null Uhr gehört der kurze Zeiger zur Zwölf. Zieh zuerst den langen orangen Zeiger zu den Minuten, dann den kurzen blauen zur Stunde. Tippe dann auf Fertig.',
    );
    expect(helpText({ track: 'daytime', mode: 'choice', context: 'forenoon', hourOnly: false }, '').spoken).toBe(
      'Der kurze blaue Zeiger zeigt die Stunde, der lange orange die Minuten. Am Vormittag bleibt die Stunde, wie sie auf der Uhr steht.',
    );
  });

  it('gives learners of version 1 what their examples showed as explained, and the missing words once', () => {
    const p = freshProgress(T0);
    for (const track of ['daytime', 'daySet', 'text'] as const) for (const tier of [0, 1, 2, 3, 4]) p.tracks[track][tier].unlocked = true;
    p.forced = [];
    const migrated = sanitizeProgress({ ...p, version: 1, contextsShown: undefined }, T0);
    expect(migrated.version).toBe(2);
    expect(migrated.contextsShown).toEqual({
      daytime: ['afternoon', 'forenoon', 'evening'], daySet: ['afternoon', 'forenoon', 'evening'], dayInput: [],
    });
    expect(migrated.forced).toEqual([
      { type: 'example', track: 'text', tier: 4, pick: 2 },
      { type: 'example', track: 'text', tier: 5, pick: 2 },
    ]);
    // Typing begun: the four-digit example instead of the second three-digit one, or once more.
    const typing = freshProgress(T0);
    typing.tracks.input[0].unlocked = true;
    typing.forced = [{ type: 'example', track: 'input', tier: 1, pick: 0 }, { type: 'example', track: 'input', tier: 1, pick: 1 }];
    expect(sanitizeProgress({ ...typing, version: 1 }, T0).forced.map((f) => f.type === 'example' && f.pick)).toEqual([0, 2]);
    typing.forced = [];
    expect(sanitizeProgress({ ...typing, version: 1 }, T0).forced).toEqual([{ type: 'example', track: 'input', tier: 1, pick: 2 }]);
  });

  it('brings a review with a time of day not yet explained there only after its example', () => {
    const p = freshProgress(T0);
    for (const track of ['digital', 'daytime', 'dayInput'] as const) for (const tier of [0, 1, 2]) Object.assign(p.tracks[track][tier], { unlocked: true, ready: true });
    p.forced = [];
    p.contextsShown = { daytime: ['afternoon', 'forenoon', 'evening', 'noon', 'night'], daySet: [], dayInput: ['afternoon'] };
    p.reviewQueue = [{ track: 'dayInput', hour: 12, minute: 15, context: 'night', dueAt: 0 }];
    const engine = new Engine(p, seeded(53));
    const tasks: Task[] = [];
    for (let i = 0; i < 30 && p.reviewQueue.length; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      tasks.push(t);
      answerTask(engine, t, true, false, 3000);
    }
    const review = tasks.findIndex((t) => t.kind === 'review');
    const example = tasks.findIndex((t) => t.kind === 'example' && t.track === 'dayInput' && t.context === 'night');
    expect(example).toBeGreaterThanOrEqual(0);
    expect(review).toBeGreaterThan(example);
  });
});
