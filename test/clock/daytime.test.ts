import { afterEach, describe, expect, it } from 'vitest';
import { buildDaytimeOptions } from '../../src/modules/clock/distractors';
import { AFTERNOON_HOURS, Engine, SESSION_GAP_MS, freshProgress, label, type Task } from '../../src/modules/clock/engine';
import { confirmation, hintFor } from '../../src/modules/clock/hints';
import { loadProgress } from '../../src/modules/clock/storage';
import { formatDaytime } from '../../src/modules/clock/time';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;

describe('afternoon formatting', () => {
  it('writes afternoon times in 24-hour notation', () => {
    expect(formatDaytime({ hour: 3, minute: 45 }, true)).toBe('15:45 Uhr');
    expect(formatDaytime({ hour: 3, minute: 45 }, false)).toBe('3:45 Uhr');
    expect(label('daytime', { hour: 6, minute: 0 })).toBe('18:00 Uhr');
  });

  it('confirms with the spoken and the written form', () => {
    expect(confirmation('daytime', { hour: 3, minute: 45 })).toBe(
      'Viertel vor vier am Nachmittag. Das schreiben wir 15:45 Uhr.',
    );
  });
});

describe('buildDaytimeOptions', () => {
  const rng = seeded(5);

  it('always offers the morning reading of the same clock as distractor', () => {
    for (const advanced of [false, true]) {
      for (const hour of AFTERNOON_HOURS) {
        for (const minute of [0, 30]) {
          const correct = { hour, minute };
          const options = buildDaytimeOptions(correct, advanced, rng);
          const labels = options.map((o) => label('daytime', o.time, o.afternoon));
          expect(new Set(labels).size).toBe(3);
          expect(options.filter((o) => o.kind === 'correct')).toEqual([{ time: correct, kind: 'correct', afternoon: true }]);
          expect(options.find((o) => o.kind === 'morning')).toEqual({ time: correct, kind: 'morning', afternoon: false });
          for (const o of options.filter((x) => x.afternoon)) {
            expect(o.time.hour + 12).toBeGreaterThanOrEqual(13);
            expect(o.time.hour + 12).toBeLessThanOrEqual(23);
          }
        }
      }
    }
  });

  it('uses a clearly different hour early and the next hour later', () => {
    const early = buildDaytimeOptions({ hour: 3, minute: 0 }, false, rng).find((o) => o.kind === 'otherHour');
    const late = buildDaytimeOptions({ hour: 3, minute: 0 }, true, rng).find((o) => o.kind === 'hour');
    expect(early?.time.hour).toBe(6);
    expect(late?.time.hour).toBe(4);
  });

  it('explains the afternoon counting when the morning time was chosen', () => {
    const hint = hintFor('daytime', { hour: 3, minute: 0 }, { time: { hour: 3, minute: 0 }, kind: 'morning', afternoon: false });
    expect(hint.text).toContain('Nachmittag');
    expect(hint.text).toContain('15:00 Uhr');
  });
});

describe('daytime track in the engine', () => {
  function playUntil(engine: Engine, done: () => boolean, max = 1500): Task[] {
    const tasks: Task[] = [];
    let now = T0;
    for (let i = 0; i < max && !done(); i++) {
      if (i % 10 === 0) now += SESSION_GAP_MS + 1;
      engine.touch(now);
      const t = engine.nextTask();
      tasks.push(t);
      engine.answer(t, t.correctIndex, false);
    }
    return tasks;
  }

  it('unlocks afternoon times only after half hours are secure', () => {
    const engine = new Engine(freshProgress(T0), seeded(6));
    playUntil(engine, () => engine.unlockedTiers('daytime').length > 0);
    expect(engine.tierState('digital', 2).secure).toBe(true);
    expect(engine.unlockedTiers('daytime')).toEqual([1]);
  });

  it('shows afternoon tasks only between 13 and 18 Uhr, with full and half hours', () => {
    const engine = new Engine(freshProgress(T0), seeded(7));
    const tasks = playUntil(engine, () => false, 900).filter((t) => t.track === 'daytime');
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(AFTERNOON_HOURS).toContain(t.time.hour);
      expect([0, 30]).toContain(t.time.minute);
    }
    expect(engine.unlockedTiers('daytime')).toEqual([1, 2]);
  });
});

describe('loading progress saved before the daytime track', () => {
  const store = new Map<string, string>();
  const original = globalThis.localStorage;
  afterEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true });
  });

  it('keeps the text share and adds the daytime track', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      configurable: true,
    });
    const legacy: Record<string, unknown> = { ...freshProgress(T0), textStep: 2, textBlock: [true], taskCounter: 5 };
    delete legacy.sideShares;
    delete legacy.lastAnswered;
    legacy.tracks = { digital: freshProgress(T0).tracks.digital, text: freshProgress(T0).tracks.text };
    store.set('lernwelt.uhr.progress.v1', JSON.stringify(legacy));

    const p = loadProgress(T0);
    expect(p.sideShares.text).toEqual({ block: [true], step: 2 });
    expect(p.sideShares.daytime).toEqual({ block: [], step: 0 });
    expect(p.tracks.daytime).toHaveLength(6);
    expect(p.lastAnswered).toBe(T0);
    expect('textStep' in p).toBe(false);
  });
});
