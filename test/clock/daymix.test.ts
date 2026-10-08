import { describe, expect, it } from 'vitest';
import { hour24 } from '../../src/modules/clock/daytime';
import {
  DAY_MIX_SHARES, Engine, MIXED_TRACKS, TRACK_TIERS, TRACKS, dayCheckPassed, freshProgress,
  type DayAttempt, type DayMix, type Task,
} from '../../src/modules/clock/engine';
import { sanitizeProgress } from '../../src/modules/clock/storage';
import { seeded } from '../rng';
import { answerTask } from './answer';

const T0 = 1_700_000_000_000;

/** Everything learnt, mastery in the middle so it can move both ways. */
function learnt(seed: number, phase: DayMix['phase']): Engine {
  const engine = new Engine(freshProgress(T0), seeded(seed));
  for (const track of TRACKS) {
    for (const tier of TRACK_TIERS[track]) {
      Object.assign(engine.tierState(track, tier), { unlocked: true, ready: true, secure: true, mastery: 60 });
    }
  }
  engine.progress.forced = [];
  engine.progress.dayMix = { phase, since: 1, recent: [] };
  return engine;
}

/** Practice tasks without answering them. */
function sample(engine: Engine, n: number): Task[] {
  return Array.from({ length: n }, () => engine.nextTask()).filter((t) => t.kind === 'practice');
}

function find(engine: Engine, match: (t: Task) => boolean): Task {
  for (let i = 0; i < 3000; i++) {
    const t = engine.nextTask();
    if (t.kind === 'practice' && match(t)) return t;
  }
  throw new Error('no such task');
}

const at = (ok: boolean, hour24: number, session: number): DayAttempt => ({ ok, hour24, session });

describe('times of day in the other tracks', () => {
  it('starts the transfer once full and half hours of the afternoon are learnt, with one announcement', () => {
    const engine = new Engine(freshProgress(T0), seeded(41));
    let started = 0;
    for (let i = 0; i < 6000 && engine.progress.dayMix.phase === 'off'; i++) {
      engine.touch(T0);
      if (answerTask(engine, engine.nextTask(), true, false, 3000).dayMixStarted) started += 1;
    }
    expect(engine.progress.dayMix.phase).toBe('transfer');
    expect(engine.tierState('daytime', 1).ready && engine.tierState('daytime', 2).ready).toBe(true);
    expect(engine.progress.dayMix.since).toBe(engine.progress.session);
    for (let i = 0; i < 200; i++) {
      if (answerTask(engine, engine.nextTask(), true, false, 3000).dayMixStarted) started += 1;
    }
    expect(started).toBe(1);
  });

  it('mixes them into learnt tiers: a quarter in the transfer, half once full', () => {
    for (const phase of ['transfer', 'full'] as const) {
      const mixed = sample(learnt(42, phase), 4000).filter((t) => MIXED_TRACKS.includes(t.track));
      const share = mixed.filter((t) => t.context).length / mixed.length;
      expect(share).toBeGreaterThan(DAY_MIX_SHARES[phase].ready - 0.05);
      expect(share).toBeLessThan(DAY_MIX_SHARES[phase].ready + 0.05);
    }
    expect(sample(learnt(42, 'off'), 1000).filter((t) => MIXED_TRACKS.includes(t.track) && t.context)).toEqual([]);
  });

  it('favours the afternoon, then the evening, with the forenoon as contrast', () => {
    const tasks = sample(learnt(43, 'full'), 6000).filter((t) => t.context);
    const share = (c: string) => tasks.filter((t) => t.context === c).length / tasks.length;
    expect(share('afternoon')).toBeGreaterThan(0.4);
    expect(share('evening')).toBeGreaterThan(share('forenoon'));
    expect(share('forenoon')).toBeGreaterThan(share('noon'));
    expect(share('night')).toBeGreaterThan(0);
  });

  it('asks each track the matching 24-hour question; words keep their answers', () => {
    const engine = learnt(44, 'full');
    const digital = find(engine, (t) => t.track === 'digital' && !!t.context);
    expect(digital.options.every((o) => o.hour24 !== undefined)).toBe(true);
    expect(digital.options[digital.correctIndex].hour24).toBe(hour24(digital.context!, digital.time.hour));
    const text = find(engine, (t) => t.track === 'text' && !!t.context);
    expect(text.options.every((o) => o.hour24 === undefined)).toBe(true);
    const set = find(engine, (t) => t.track === 'set' && !!t.context);
    expect(set.prompt).toBe('daytime');
  });

  it('introduces a new tier with the familiar hours first', () => {
    const engine = learnt(45, 'full');
    Object.assign(engine.tierState('digital', 6), { ready: false, secure: false, mastery: 30, window: [] });
    const newest = () => sample(engine, 3000).filter((t) => t.track === 'digital' && t.tier === 6);
    expect(newest().length).toBeGreaterThan(50);
    expect(newest().some((t) => t.context)).toBe(false);
    engine.tierState('digital', 6).window = [
      { ok: true, hour: 3, minute: 7 }, { ok: true, hour: 5, minute: 23 }, { ok: true, hour: 9, minute: 41 },
    ];
    const later = newest();
    const share = later.filter((t) => t.context).length / later.length;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(DAY_MIX_SHARES.full.ready);
  });

  it('a wrong half of the day leaves the clock reading of a mixed track as it is', () => {
    const engine = learnt(46, 'full');
    const choice = find(engine, (t) => t.track === 'digital' && !!t.context && t.options.some((o) => o.kind === 'otherHalf'));
    const state = engine.tierState('digital', choice.tier);
    const r = engine.answer(choice, choice.options.findIndex((o) => o.kind === 'otherHalf'), false);
    expect(r.ok).toBe(false);
    expect(r.hint).toContain('Tageszeit');
    expect(state.mastery).toBe(60);
    expect(engine.progress.reviewQueue.some((q) => q.track === 'digital' && q.context === choice.context)).toBe(true);

    const typed = find(engine, (t) => t.track === 'input' && !!t.context && hour24(t.context, t.time.hour) !== t.time.hour);
    const before = engine.tierState('input', typed.tier).mastery;
    const r2 = engine.answerTime(typed, { hour: typed.time.hour, minute: typed.time.minute }, false);
    expect(r2.ok).toBe(false);
    expect(r2.hint).toContain('richtig abgelesen');
    expect(engine.tierState('input', typed.tier).mastery).toBe(before);
  });

  it('keeps a review with a time of day next to one without for the same time', () => {
    const engine = learnt(50, 'full');
    const plain = find(engine, (t) => t.track === 'digital' && !t.context);
    engine.answer(plain, plain.options.findIndex((o) => o.kind !== 'correct'), false);
    const queued = engine.progress.reviewQueue.length;
    const mixed = find(engine, (t) => t.track === 'digital' && !!t.context);
    engine.progress.reviewQueue.push({ track: 'digital', hour: mixed.time.hour, minute: mixed.time.minute, dueAt: 1e9 });
    engine.answer(mixed, mixed.options.findIndex((o) => o.kind !== 'correct'), false);
    expect(engine.progress.reviewQueue).toHaveLength(queued + 2);
    expect(engine.progress.reviewQueue.at(-1)).toMatchObject({ hour: mixed.time.hour, minute: mixed.time.minute, context: mixed.context });
  });

  it('the daytime track itself still counts a wrong half of the day', () => {
    const engine = learnt(47, 'full');
    const t = find(engine, (x) => x.track === 'daytime' && x.options.some((o) => o.kind === 'otherHalf'));
    engine.answer(t, t.options.findIndex((o) => o.kind === 'otherHalf'), false);
    expect(engine.tierState('daytime', t.tier).mastery).toBe(50);
  });

  it('checks only choosing and typing the 24-hour time towards "full"', () => {
    const engine = learnt(48, 'transfer');
    const text = find(engine, (t) => t.track === 'text' && !!t.context);
    answerTask(engine, text, true);
    const set = find(engine, (t) => t.track === 'set' && !!t.context);
    answerTask(engine, set, true);
    expect(engine.progress.dayMix.recent).toEqual([]);
    const digital = find(engine, (t) => t.track === 'digital' && !!t.context);
    answerTask(engine, digital, true);
    expect(engine.progress.dayMix.recent).toHaveLength(1);
  });

  it('becomes full only after a later session, on varied hours, with a forenoon', () => {
    const engine = learnt(49, 'transfer');
    for (let i = 0; i < 30; i++) answerTask(engine, find(engine, (t) => t.track === 'digital' && !!t.context), true);
    expect(engine.progress.dayMix.phase).toBe('transfer');
    engine.progress.session += 1;
    for (let i = 0; i < 30 && engine.progress.dayMix.phase === 'transfer'; i++) {
      answerTask(engine, find(engine, (t) => (t.track === 'digital' || t.track === 'input') && !!t.context), true);
    }
    expect(engine.progress.dayMix.phase).toBe('full');
  });
});

describe('the check towards "full"', () => {
  const later = (recent: DayAttempt[]): DayMix => ({ phase: 'transfer', since: 1, recent });
  const good = [9, 15, 15, 16, 19, 20, 21, 14, 13, 17].map((h, i) => at(true, h, i < 5 ? 1 : 2));

  it('passes with 10 right answers, half of them later, on several hours with a forenoon', () => {
    expect(dayCheckPassed(later(good))).toBe(true);
  });

  it('allows two mistakes but not three', () => {
    // Mistakes in the first session, past the forenoon at 9.
    expect(dayCheckPassed(later(good.map((a, i) => (i === 1 || i === 2 ? { ...a, ok: false } : a))))).toBe(true);
    expect(dayCheckPassed(later(good.map((a, i) => (i >= 1 && i <= 3 ? { ...a, ok: false } : a))))).toBe(false);
  });

  it('needs five right answers from a later session', () => {
    expect(dayCheckPassed(later(good.map((a, i) => ({ ...a, session: i < 6 ? 1 : 2 }))))).toBe(false);
    // Five later ones, but two of them wrong.
    expect(dayCheckPassed(later(good.map((a, i) => (i === 5 || i === 9 ? { ...a, ok: false } : a))))).toBe(false);
  });

  it('needs both a forenoon and an afternoon or evening', () => {
    expect(dayCheckPassed(later(good.map((a) => (a.hour24 === 9 ? { ...a, hour24: 18 } : a))))).toBe(false);
    expect(dayCheckPassed(later(good.map((a) => ({ ...a, hour24: a.hour24 % 3 === 0 ? 9 : 10 }))))).toBe(false);
  });

  it('needs ten answers', () => {
    expect(dayCheckPassed(later(good.slice(1)))).toBe(false);
  });
});

describe('saved times of day', () => {
  it('keeps a valid state and drops broken parts', () => {
    const p = freshProgress(T0);
    const raw = JSON.parse(JSON.stringify({
      ...p,
      dayMix: { phase: 'transfer', since: 3, recent: [at(true, 15, 3), { ok: true, hour24: 25, session: 3 }, 'x'] },
    }));
    expect(sanitizeProgress(raw, T0).dayMix).toEqual({ phase: 'transfer', since: 3, recent: [at(true, 15, 3)] });
    expect(sanitizeProgress({ ...raw, dayMix: { phase: 'all' } }, T0).dayMix).toEqual(p.dayMix);
    const { dayMix: _, ...old } = raw;
    expect(sanitizeProgress(old, T0).dayMix).toEqual(p.dayMix);
  });
});
