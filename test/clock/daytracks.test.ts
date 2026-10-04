import { describe, expect, it } from 'vitest';
import { hour24 } from '../../src/modules/clock/daytime';
import { Engine, TRACK_BONUS, freshProgress, type Task, type Track } from '../../src/modules/clock/engine';
import { confirmation, dayInputHint, daySetHint, explainExample } from '../../src/modules/clock/hints';
import { sanitizeProgress } from '../../src/modules/clock/storage';
import { seeded } from '../rng';
import { answerTask } from './answer';

const T0 = 1_700_000_000_000;

function playUntil(engine: Engine, done: () => boolean, max = 6000): Task[] {
  const tasks: Task[] = [];
  for (let i = 0; i < max && !done(); i++) {
    engine.touch(T0);
    const t = engine.nextTask();
    tasks.push(t);
    answerTask(engine, t, true, false, 3000);
  }
  return tasks;
}

/** The next scored task of a track (examples and other tracks are answered correctly). */
function nextOf(engine: Engine, track: Track): Task {
  for (let i = 0; i < 500; i++) {
    const t = engine.nextTask();
    if (t.track === track && t.kind !== 'example') return t;
    answerTask(engine, t, true);
  }
  throw new Error(`no ${track} task`);
}

describe('hints for 24-hour times', () => {
  it('typing: right reading, but not converted', () => {
    expect(dayInputHint({ hour: 9, minute: 30 }, 'evening', { hour: 9, minute: 30 }).text).toBe(
      'Du hast die Uhr richtig abgelesen. Am Abend zählen wir nach zwölf weiter: 9 + 12 = 21.',
    );
    expect(dayInputHint({ hour: 9, minute: 30 }, 'forenoon', { hour: 21, minute: 30 }).text).toContain('9 bleibt 9');
    expect(dayInputHint({ hour: 12, minute: 15 }, 'night', { hour: 12, minute: 15 }).text).toContain('Aus 12 wird 0');
    expect(dayInputHint({ hour: 12, minute: 15 }, 'noon', { hour: 0, minute: 15 }).text).toContain('12 bleibt 12');
  });

  it('typing: no praise for the reading when the minutes are wrong too', () => {
    expect(dayInputHint({ hour: 9, minute: 30 }, 'evening', { hour: 9, minute: 0 }).text).toBe(
      'Am Abend zählen wir nach zwölf weiter: 9 + 12 = 21.',
    );
  });

  it('typing: a misread clock gets the reading hint', () => {
    const hint = dayInputHint({ hour: 9, minute: 30 }, 'evening', { hour: 22, minute: 30 });
    expect(hint.focus).toBe('hour');
    expect(hint.text).toBe('Der kurze Zeiger ist noch zwischen neun und zehn.');
  });

  it('setting: converts back, minutes first', () => {
    expect(daySetHint({ hour: 9, minute: 30 }, 'evening', { hour: 1, minute: 30 }).text).toBe(
      '21 Uhr ist 9 Uhr am Abend. Rechne zwölf weniger: 21 − 12 = 9. Stelle den kurzen Zeiger zwischen die 9 und die 10.',
    );
    expect(daySetHint({ hour: 12, minute: 0 }, 'night', { hour: 6, minute: 0 }).text).toContain('0 Uhr ist Mitternacht');
    expect(daySetHint({ hour: 9, minute: 30 }, 'evening', { hour: 9, minute: 0 }).focus).toBe('minute');
  });

  it('confirms and explains with the 24-hour time', () => {
    expect(confirmation({ track: 'dayInput', time: { hour: 9, minute: 30 }, context: 'evening' })).toBe('21:30 Uhr – halb zehn am Abend.');
    expect(confirmation({ track: 'daySet', time: { hour: 3, minute: 0 }, context: 'afternoon' })).toBe('15:00 Uhr – drei Uhr am Nachmittag.');
    expect(explainExample({ track: 'dayInput', time: { hour: 9, minute: 30 }, context: 'evening' })).toContain('Tippe 2 1 3 0');
    expect(explainExample({ track: 'daySet', time: { hour: 9, minute: 30 }, context: 'evening' })).toContain('21 − 12 = 9');
  });
});

describe('24-hour tracks in the engine', () => {
  it('sets the hands from 24-hour times before typing with a time of day', () => {
    const engine = new Engine(freshProgress(T0), seeded(21));
    const tasks = playUntil(engine, () => engine.unlockedTiers('dayInput').length > 0);
    expect(engine.unlockedTiers('dayInput')).toEqual([1]);
    expect(engine.tierState('daySet', 1).ready).toBe(true);
    expect(engine.tierState('input', 1).ready).toBe(true);
    expect(engine.tierState('daytime', 1).ready).toBe(true);
    const daySet = tasks.filter((t) => t.track === 'daySet');
    expect(daySet.length).toBeGreaterThan(0);
    for (const t of daySet) {
      expect(t.mode).toBe('set');
      expect(t.prompt).toBe('daytime');
      expect(t.context).toBeDefined();
    }
  });

  it('typing accepts only the 24-hour time of the context', () => {
    const engine = new Engine(freshProgress(T0), seeded(22));
    playUntil(engine, () => engine.unlockedTiers('dayInput').length > 0);
    const task = nextOf(engine, 'dayInput');
    expect(task.mode).toBe('input');
    const h = hour24(task.context!, task.time.hour);
    const otherHalf = h === 12 ? 0 : h === 0 ? 12 : (h + 12) % 24;
    const r = engine.answerTime(task, { hour: otherHalf, minute: task.time.minute }, false);
    expect(r.ok).toBe(false);
    expect(r.hint).toContain('richtig abgelesen');
    const next = nextOf(engine, 'dayInput');
    const ok = engine.answerTime(next, { hour: hour24(next.context!, next.time.hour), minute: next.time.minute }, false);
    expect(ok.ok).toBe(true);
  });

  it('typing checks the exact 24-hour time in every time of day', () => {
    const engine = new Engine(freshProgress(T0), seeded(24));
    playUntil(engine, () => engine.dayContexts().length === 5 && engine.unlockedTiers('dayInput').length > 0, 12000);
    const rejected = new Set<string>();
    const accepted = new Set<string>();
    for (let i = 0; i < 400 && (rejected.size < 5 || accepted.size < 5); i++) {
      const t = nextOf(engine, 'dayInput');
      const h = hour24(t.context!, t.time.hour);
      if (i % 3 === 0) {
        // Other half of the day: 9 for 21, 12 for 0 (night), 0 for 12 (noon).
        const otherHalf = h === 12 ? 0 : h === 0 ? 12 : (h + 12) % 24;
        expect(engine.answerTime(t, { hour: otherHalf, minute: t.time.minute }, false).ok).toBe(false);
        rejected.add(t.context!);
      } else if (i % 3 === 1) {
        expect(engine.answerTime(t, { hour: h, minute: (t.time.minute + 15) % 60 }, false).ok).toBe(false);
      } else {
        expect(engine.answerTime(t, { hour: h, minute: t.time.minute }, false).ok).toBe(true);
        accepted.add(t.context!);
      }
    }
    expect(rejected.size).toBe(5);
    expect(accepted.size).toBe(5);
  });

  it('starts locked for progress saved before these tracks and unlocks later', () => {
    const engine = new Engine(freshProgress(T0), seeded(25));
    playUntil(engine, () => engine.tierState('daytime', 1).ready && engine.tierState('set', 1).ready);
    const old = JSON.parse(JSON.stringify(engine.progress));
    delete old.tracks.daySet;
    delete old.tracks.dayInput;
    const restored = new Engine(sanitizeProgress(old, T0), seeded(26));
    expect(restored.tierState('daytime', 1).ready).toBe(true);
    expect(restored.progress.tracks.daySet.every((t) => !t.unlocked && t.mastery === 0)).toBe(true);
    expect(restored.progress.tracks.dayInput).toHaveLength(6);
    playUntil(restored, () => restored.unlockedTiers('daySet').length > 0);
    expect(restored.unlockedTiers('daySet')).toEqual([1]);
  });

  it('gives the most extra round points for converting', () => {
    expect(TRACK_BONUS.daySet).toBe(15);
    expect(TRACK_BONUS.dayInput).toBe(15);
  });

  it('favours afternoon and evening, keeps the other times of day as contrast', () => {
    const engine = new Engine(freshProgress(T0), seeded(23));
    playUntil(engine, () => engine.dayContexts().length === 5 && engine.unlockedTiers('daySet').length > 0, 12000);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      const t = nextOf(engine, 'daySet');
      counts[t.context!] = (counts[t.context!] ?? 0) + 1;
      answerTask(engine, t, true);
    }
    const converted = (counts.afternoon ?? 0) + (counts.evening ?? 0);
    expect(converted).toBeGreaterThan(150);
    expect(counts.forenoon).toBeGreaterThan(0);
    expect((counts.noon ?? 0) + (counts.night ?? 0)).toBeGreaterThan(0);
  });
});
