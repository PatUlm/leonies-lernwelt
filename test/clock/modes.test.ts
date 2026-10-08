import { describe, expect, it } from 'vitest';
import { hourFromAngle, minuteDrag } from '../../src/modules/clock/clock';
import { Engine, TRACK_BONUS, TIER_POINTS, freshProgress, type Task, type Track } from '../../src/modules/clock/engine';
import { formatSpoken } from '../../src/modules/clock/german';
import { inputHint, setHint } from '../../src/modules/clock/hints';
import { sanitizeProgress } from '../../src/modules/clock/storage';
import { seeded } from '../rng';
import { answerTask } from './answer';

const T0 = 1_700_000_000_000;

/** Plays correctly (and fluently) until `done`, returning all tasks. */
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

describe('setting the hands', () => {
  it('turns the hour hand to the nearest hour, keeping the minutes', () => {
    expect(hourFromAngle(90, 0)).toBe(3);
    expect(hourFromAngle(105, 30)).toBe(3);
    expect(hourFromAngle(352, 0)).toBe(12);
  });

  it('snaps the minute hand and moves the hour on over the 12', () => {
    let total = 3 * 60 + 50; // 3:50
    for (const angle of [330, 345, 355, 5, 20]) total = minuteDrag(total, angle, 5).total;
    expect(minuteDrag(total, 20, 5).time).toEqual({ hour: 4, minute: 5 });
    // and back again
    for (const angle of [5, 355, 340]) total = minuteDrag(total, angle, 5).total;
    expect(minuteDrag(total, 330, 5).time).toEqual({ hour: 3, minute: 55 });
  });

  it('snaps to half hours at tier 2 without jumping an hour', () => {
    const start = 3 * 60;
    expect(minuteDrag(start, 170, 30).time).toEqual({ hour: 3, minute: 30 });
    expect(minuteDrag(start, 40, 30).time).toEqual({ hour: 3, minute: 0 });
  });

  it('accepts exactly the target time and hints at the minute hand first', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    playUntil(engine, () => engine.unlockedTiers('set').length > 0);
    let task = engine.nextTask();
    while (task.mode !== 'set' || task.kind === 'example') {
      answerTask(engine, task, true);
      task = engine.nextTask();
    }
    const wrong = engine.answerTime(task, { hour: task.time.hour, minute: (task.time.minute + 30) % 60 }, false);
    expect(wrong.ok).toBe(false);
    expect(setHint(task.time, { hour: task.time.hour, minute: 7 }).focus).toBe('minute');
    expect(setHint({ hour: 3, minute: 45 }, { hour: 5, minute: 45 }).text).toBe('Stelle den kurzen Zeiger zwischen die 3 und die 4.');
  });
});

describe('typing the time', () => {
  function inputTask(seed: number): { engine: Engine; task: Task } {
    const engine = new Engine(freshProgress(T0), seeded(seed));
    playUntil(engine, () => engine.unlockedTiers('input').length > 0);
    let task = engine.nextTask();
    while (task.mode !== 'input' || task.kind === 'example') {
      answerTask(engine, task, true);
      task = engine.nextTask();
    }
    return { engine, task };
  }

  it('comes after setting the hands was learned', () => {
    const { engine } = inputTask(2);
    expect(engine.tierState('set', 1).ready).toBe(true);
  });

  it('accepts both halves of the day without a time-of-day context', () => {
    const { engine, task } = inputTask(3);
    const r = engine.answerTime(task, { hour: task.time.hour + 12 === 24 ? 0 : task.time.hour + 12, minute: task.time.minute }, false);
    expect(r.ok).toBe(true);
  });

  it('hints at the hour first, then counts the minutes', () => {
    expect(inputHint({ hour: 11, minute: 23 }, 12).text).toBe('Der kurze Zeiger ist noch zwischen elf und zwölf.');
    expect(inputHint({ hour: 11, minute: 23 }, 11).text).toContain('zwanzig, einundzwanzig, zweiundzwanzig, dreiundzwanzig');
  });

  it('gives extra round points for setting and typing', () => {
    expect(TRACK_BONUS.set).toBe(10);
    expect(TRACK_BONUS.input).toBe(10);
    const { engine, task } = inputTask(4);
    expect(answerTask(engine, task, true).points).toBe(TIER_POINTS[task.tier] + 10);
  });
});

describe('"vor halb" phrasing', () => {
  it('says :20, :25, :35, :40 relative to the half hour', () => {
    expect(formatSpoken({ hour: 3, minute: 25 }, { half: true })).toBe('fünf vor halb vier');
    expect(formatSpoken({ hour: 3, minute: 35 }, { half: true })).toBe('fünf nach halb vier');
    expect(formatSpoken({ hour: 3, minute: 20 }, { half: true })).toBe('zehn vor halb vier');
    expect(formatSpoken({ hour: 3, minute: 40 }, { half: true })).toBe('zehn nach halb vier');
    expect(formatSpoken({ hour: 3, minute: 10 }, { half: true })).toBe('zehn nach drei');
  });

  it('keeps one phrase per time in that style too', () => {
    const phrases = new Set<string>();
    for (let h = 1; h <= 12; h++) for (let m = 0; m < 60; m++) phrases.add(formatSpoken({ hour: h, minute: m }, { half: true }));
    expect(phrases.size).toBe(720);
  });

  it('practises only the minutes it renames, after the 5-minute words', () => {
    const engine = new Engine(freshProgress(T0), seeded(8));
    const tasks = playUntil(engine, () => engine.unlockedTiers('halb').length === 2, 6000).filter((t) => t.track === 'halb');
    expect(engine.tierState('text', 4).ready).toBe(true);
    for (const t of tasks) expect([20, 25, 35, 40]).toContain(t.time.minute);
  });
});

describe('introducing side tracks', () => {
  it('starts one new side track tier at a time, text before the time of day before setting', () => {
    const engine = new Engine(freshProgress(T0), seeded(9));
    const order: Track[] = [];
    for (let i = 0; i < 3000 && order.length < 3; i++) {
      engine.touch(T0);
      const t = engine.nextTask();
      const r = answerTask(engine, t, true, false, 3000);
      const sides = r.unlocked.filter((u) => u.track !== 'digital');
      expect(sides.length).toBeLessThanOrEqual(1);
      for (const u of sides) if (!order.includes(u.track)) order.push(u.track);
    }
    expect(order).toEqual(['text', 'daytime', 'set']);
  });
});

describe('say first, then reveal', () => {
  it('appears for secure tiers when enabled and gives no mastery points', () => {
    const engine = new Engine(freshProgress(T0), seeded(10), { sayFirst: true });
    playUntil(engine, () => engine.tierState('digital', 1).secure && engine.tierState('digital', 2).secure);
    let sayFirst: Task | undefined;
    for (let i = 0; i < 300 && !sayFirst; i++) {
      const t = engine.nextTask();
      if (t.sayFirst) sayFirst = t;
      else answerTask(engine, t, true);
    }
    expect(sayFirst).toBeDefined();
    const state = engine.tierState(sayFirst!.track, sayFirst!.tier);
    const before = state.mastery;
    const r = answerTask(engine, sayFirst!, true);
    expect(r.points).toBeGreaterThan(0);
    expect(state.mastery).toBe(before);
  });

  it('never appears when switched off', () => {
    const engine = new Engine(freshProgress(T0), seeded(11), { sayFirst: false });
    expect(playUntil(engine, () => false, 400).some((t) => t.sayFirst)).toBe(false);
  });
});

describe('sanitizeProgress', () => {
  it('drops injected strings and keeps valid numbers', () => {
    const raw = {
      ...freshProgress(T0),
      trophies: '<img src=x onerror=alert(1)>',
      points: 120,
      round: { target: '<b>', points: 30, correct: 2, tasks: 3 },
      recent: ['3:00', '<script>'],
    };
    const p = sanitizeProgress(JSON.parse(JSON.stringify(raw)), T0);
    expect(p.trophies).toBe(0);
    expect(p.points).toBe(120);
    expect(typeof p.round.target).toBe('number');
    expect(p.recent).toEqual(['3:00']);
  });

  it('turns anything unknown into a fresh progress', () => {
    expect(sanitizeProgress('nonsense', T0).taskCounter).toBe(0);
    expect(sanitizeProgress({ version: 2 }, T0).taskCounter).toBe(0);
  });

  it('derives mastery points from progress saved before them', () => {
    const old = JSON.parse(JSON.stringify(freshProgress(T0)));
    for (const t of old.tracks.digital) delete t.mastery;
    old.tracks.digital[0] = { ...old.tracks.digital[0], ready: true, secure: true };
    old.tracks.digital[1] = { ...old.tracks.digital[1], unlocked: true, ready: true };
    old.taskCounter = 5;
    delete old.lastAnswered;
    delete old.tracks.set;
    const p = sanitizeProgress(old, T0);
    expect(p.tracks.digital.slice(0, 3).map((t) => t.mastery)).toEqual([100, 60, 0]);
    expect(p.tracks.set).toHaveLength(6);
    expect(p.lastAnswered).toBe(T0);
  });
});
