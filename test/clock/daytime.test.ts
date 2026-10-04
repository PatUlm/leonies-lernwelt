import { describe, expect, it } from 'vitest';
import { contextConfirmation, hour24 } from '../../src/modules/clock/daytime';
import { buildDaytimeOptions } from '../../src/modules/clock/distractors';
import { Engine, freshProgress, label, type Task } from '../../src/modules/clock/engine';
import { hintFor } from '../../src/modules/clock/hints';
import { formatDaytime } from '../../src/modules/clock/time';
import { seeded } from '../rng';
import { answerTask } from './answer';

const T0 = 1_700_000_000_000;

describe('time-of-day formatting', () => {
  it('writes the hour in 24-hour notation by context', () => {
    expect(formatDaytime({ hour: 3, minute: 45 }, 15)).toBe('15:45 Uhr');
    expect(hour24('afternoon', 3)).toBe(15);
    expect(hour24('forenoon', 9)).toBe(9);
    expect(hour24('evening', 9)).toBe(21);
    expect(hour24('noon', 12)).toBe(12);
    expect(hour24('night', 12)).toBe(0);
    expect(label('daytime', { hour: 6, minute: 0 }, 18)).toBe('18:00 Uhr');
  });

  it('confirms with the written and the spoken form', () => {
    expect(contextConfirmation('forenoon', { hour: 9, minute: 30 })).toBe('9:30 Uhr – halb zehn am Vormittag.');
    expect(contextConfirmation('evening', { hour: 9, minute: 30 })).toBe('21:30 Uhr – halb zehn am Abend.');
    expect(contextConfirmation('noon', { hour: 12, minute: 15 })).toBe('12:15 Uhr – Viertel nach zwölf am Mittag.');
    expect(contextConfirmation('night', { hour: 12, minute: 15 })).toBe('0:15 Uhr – Viertel nach zwölf in der Nacht.');
    expect(contextConfirmation('night', { hour: 12, minute: 0 })).toBe('0:00 Uhr – Mitternacht.');
  });
});

describe('buildDaytimeOptions', () => {
  const rng = seeded(5);

  it('gives three distinct options, exactly one right, all within one day', () => {
    for (const advanced of [false, true]) {
      for (const [hour, h24] of [[3, 15], [9, 9], [9, 21], [12, 12], [12, 0], [11, 11], [11, 23]]) {
        for (const minute of [0, 15, 30, 45]) {
          const options = buildDaytimeOptions({ hour, minute }, h24, advanced, rng);
          const labels = options.map((o) => label('daytime', o.time, o.hour24));
          expect(new Set(labels).size).toBe(3);
          expect(options.filter((o) => o.kind === 'correct')).toHaveLength(1);
          for (const o of options) {
            expect(o.hour24).toBeGreaterThanOrEqual(0);
            expect(o.hour24).toBeLessThanOrEqual(23);
            expect(o.time.hour).toBe(o.hour24! % 12 || 12);
          }
        }
      }
    }
  });

  it('offers the other half of the day in about half of the tasks', () => {
    let other = 0;
    for (let i = 0; i < 400; i++) {
      if (buildDaytimeOptions({ hour: 3, minute: 0 }, 15, false, rng).some((o) => o.kind === 'otherHalf')) other++;
    }
    expect(other).toBeGreaterThan(150);
    expect(other).toBeLessThan(250);
  });

  it('explains the context when the other half of the day was chosen', () => {
    const hint = hintFor(
      { track: 'daytime', time: { hour: 3, minute: 0 }, context: 'afternoon' },
      { time: { hour: 3, minute: 0 }, kind: 'otherHalf', hour24: 3 },
    );
    expect(hint.text).toContain('15:00 Uhr');
    expect(hint.text).toContain('dreizehn');
  });
});

describe('daytime track in the engine', () => {
  function playUntil(engine: Engine, done: () => boolean, max = 3000): Task[] {
    const tasks: Task[] = [];
    for (let i = 0; i < max && !done(); i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      tasks.push(t);
      answerTask(engine, t, true, false, 3000);
    }
    return tasks;
  }

  it('unlocks the afternoon only after half hours are mastered', () => {
    const engine = new Engine(freshProgress(T0), seeded(6));
    playUntil(engine, () => engine.unlockedTiers('daytime').length > 0);
    expect(engine.tierState('digital', 2).ready).toBe(true);
    expect(engine.unlockedTiers('daytime')).toEqual([1]);
  });

  it('starts with the afternoon and adds the other times of day step by step', () => {
    const engine = new Engine(freshProgress(T0), seeded(7));
    const tasks = playUntil(engine, () => engine.dayContexts().length === 5).filter((t) => t.track === 'daytime');
    expect(tasks.slice(0, 5).every((t) => t.context === 'afternoon')).toBe(true);
    for (const t of tasks) expect(t.context).toBeDefined();
    expect(engine.dayContexts()).toEqual(['afternoon', 'forenoon', 'evening', 'noon', 'night']);
  });
});
