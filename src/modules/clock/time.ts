export interface ClockTime {
  /** 1–12, as read on an analog clock. */
  hour: number;
  /** 0–59 */
  minute: number;
}

/** Difficulty tier of a time, derived from its minute. 1 = easiest. */
export type Tier = 1 | 2 | 3 | 4 | 5 | 6;
export const TIERS: readonly Tier[] = [1, 2, 3, 4, 5, 6];

export const TIER_MINUTES: Record<Tier, readonly number[]> = {
  1: [0],
  2: [30],
  3: [15, 45],
  4: [10, 20, 40, 50],
  5: [5, 25, 35, 55],
  6: Array.from({ length: 60 }, (_, m) => m).filter((m) => m % 5 !== 0),
};

export function tierOf(minute: number): Tier {
  for (const tier of TIERS) {
    if (TIER_MINUTES[tier].includes(minute)) return tier;
  }
  throw new RangeError(`invalid minute ${minute}`);
}

export type Rng = () => number;

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

export function randomTimeInTier(tier: Tier, rng: Rng): ClockTime {
  return { hour: 1 + Math.floor(rng() * 12), minute: pick(TIER_MINUTES[tier], rng) };
}

/** Wraps any hour value into 1–12. */
export function wrapHour(hour: number): number {
  return ((((hour - 1) % 12) + 12) % 12) + 1;
}

/** Adds minutes, carrying into the hour (12-hour clock). */
export function addMinutes(t: ClockTime, delta: number): ClockTime {
  const total = (((t.hour % 12) * 60 + t.minute + delta) % 720 + 720) % 720;
  return { hour: wrapHour(Math.floor(total / 60)), minute: total % 60 };
}

export function sameTime(a: ClockTime, b: ClockTime): boolean {
  return a.hour === b.hour && a.minute === b.minute;
}

export function timeKey(t: ClockTime): string {
  return `${t.hour}:${t.minute}`;
}

/** "15:45 Uhr": 24-hour notation for the daytime track. */
export function formatDaytime(t: ClockTime, hour24: number): string {
  return `${hour24}:${String(t.minute).padStart(2, '0')} Uhr`;
}

/** "3:05" – 12-hour notation, 12:00 instead of 0:00. */
export function formatDigital(t: ClockTime): string {
  return `${t.hour}:${String(t.minute).padStart(2, '0')}`;
}
