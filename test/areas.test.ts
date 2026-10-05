import { describe, expect, it } from 'vitest';
import { AREAS, pickRecommendation, type ModuleEntry } from '../src/areas';
import { Engine, SESSION_GAP_MS, freshProgress } from '../src/modules/clock/engine';
import { REFRESH_AFTER_MS, statsFromProgress } from '../src/modules/clock/stats';
import { SUGGESTION_PRIORITY, type ModuleStats } from '../src/modules/types';
import { seeded } from './rng';
import { answerTask } from './clock/answer';

const T0 = 1_700_000_000_000;

function play(engine: Engine, tasks: number, now: number): void {
  for (let i = 0; i < tasks; i++) {
    engine.touch(now);
    const t = engine.nextTask();
    answerTask(engine, t, true, false);
  }
}

/** Plays correctly until the first trophy, so no round is in progress. */
function finishRound(engine: Engine, now: number): void {
  for (let i = 0; i < 100 && engine.progress.trophies === 0; i++) play(engine, 1, now);
}

describe('clock suggestion', () => {
  it('invites to discover the clock on first start', () => {
    const stats = statsFromProgress(freshProgress(T0), T0);
    expect(stats.started).toBe(false);
    expect(stats.suggestion).toEqual({ priority: SUGGESTION_PRIORITY.practice, label: 'Uhr entdecken' });
  });

  it('suggests continuing a started round first', () => {
    const engine = new Engine(freshProgress(T0), seeded(1));
    play(engine, 4, T0);
    const stats = statsFromProgress(engine.progress, T0);
    expect(stats.round).not.toBeNull();
    expect(stats.suggestion.priority).toBe(SUGGESTION_PRIORITY.continueRound);
  });

  it('suggests a refresh after three days without practice once the round is done', () => {
    const engine = new Engine(freshProgress(T0), seeded(2));
    finishRound(engine, T0);
    expect(engine.progress.round.tasks).toBe(0);
    const later = T0 + REFRESH_AFTER_MS + SESSION_GAP_MS;
    const stats = statsFromProgress(engine.progress, later);
    expect(stats.suggestion.label).toBe('Uhr auffrischen');
  });

  it('does not count opening without answering as practice', () => {
    const engine = new Engine(freshProgress(T0), seeded(3));
    finishRound(engine, T0);
    const later = T0 + REFRESH_AFTER_MS + SESSION_GAP_MS;
    engine.touch(later);
    engine.nextTask(); // shown, never answered
    expect(statsFromProgress(engine.progress, later).suggestion.label).toBe('Uhr auffrischen');
  });

  it('suggests reviews only once they are due', () => {
    const engine = new Engine(freshProgress(T0), seeded(4));
    finishRound(engine, T0);
    const p = engine.progress;
    p.reviewQueue = [{ track: 'digital', hour: 3, minute: 0, dueAt: p.taskCounter + 4 }];
    expect(statsFromProgress(p, T0).suggestion.priority).not.toBe(SUGGESTION_PRIORITY.reviewDue);
    p.reviewQueue[0].dueAt = p.taskCounter + 1;
    expect(statsFromProgress(p, T0).suggestion.priority).toBe(SUGGESTION_PRIORITY.reviewDue);
  });

  it('counts secure clock tiers as goals', () => {
    const stats = statsFromProgress(freshProgress(T0), T0);
    expect(stats.goals).toEqual({ done: 0, total: 6, label: '0 von 6 Stufen sicher' });
  });
});

describe('pickRecommendation', () => {
  const entry = (id: string, priority: ModuleStats['suggestion']['priority'], lastPlayed: number | null): ModuleEntry =>
    ({
      area: AREAS[0],
      module: { id } as ModuleEntry['module'],
      stats: { suggestion: { priority, label: id }, lastPlayed } as ModuleStats,
    }) as ModuleEntry;

  it('picks exactly one module, the most urgent', () => {
    const picked = pickRecommendation([entry('a', 5, 1), entry('b', 1, 2), entry('c', 3, 0)]);
    expect(picked?.module.id).toBe('b');
  });

  it('prefers the module not practised for longer on a tie', () => {
    expect(pickRecommendation([entry('a', 2, 500), entry('b', 2, 100)])?.module.id).toBe('b');
    expect(pickRecommendation([entry('a', 5, 100), entry('b', 5, null)])?.module.id).toBe('b');
  });

  it('returns null without modules', () => {
    expect(pickRecommendation([])).toBeNull();
  });
});

describe('areas', () => {
  it('has the five school subjects with the clock in maths', () => {
    expect(AREAS.map((a) => a.title)).toEqual(['Mathe', 'Deutsch', 'Musik', 'HSU', 'Englisch']);
    expect(AREAS[0].modules.map((m) => m.id)).toEqual(['uhr']);
    expect(AREAS[1].modules.map((m) => m.id)).toEqual(['artikel']);
    expect(AREAS[4].modules.map((m) => m.id)).toEqual(['woerter']);
  });
});
