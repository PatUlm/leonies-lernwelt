import { TIER_MINUTES, TIERS, pick, sameTime, wrapHour, type ClockTime, type Rng, type Tier } from './time';

/** Which misconception an answer option represents. */
export type OptionKind = 'correct' | 'hour' | 'minute' | 'otherHour' | 'easy' | 'morning';

export interface AnswerOption {
  time: ClockTime;
  kind: OptionKind;
  /** Daytime track: shown as afternoon time (15:45) instead of 3:45. */
  afternoon?: boolean;
}

export interface DistractorContext {
  /** Tier of the task; distractors never use minutes above it. */
  tier: Tier;
  /** Later in a tier: allow two close distractors (hour and minute error). */
  advanced: boolean;
}

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 60;
  return Math.min(d, 60 - d);
}

/** Minutes of all tiers up to and including `tier`. */
function minutesUpTo(tier: Tier): number[] {
  return TIERS.filter((t) => t <= tier).flatMap((t) => TIER_MINUTES[t]);
}

/** Typical hour misreading: past the half the hand is near the next number. */
function hourError(t: ClockTime, rng: Rng): ClockTime {
  const delta = t.minute >= 30 ? 1 : rng() < 0.5 ? -1 : 1;
  return { hour: wrapHour(t.hour + delta), minute: t.minute };
}

/** Same minute, hour at least two away – distinguishes only by the hour hand. */
function otherHour(t: ClockTime, rng: Rng): ClockTime {
  const offset = 2 + Math.floor(rng() * 9); // 2…10
  return { hour: wrapHour(t.hour + offset), minute: t.minute };
}

/** Minute misreading on the same hour: mirrored side or a close neighbour. */
function minuteError(t: ClockTime, tier: Tier, rng: Rng): ClockTime {
  // 15 ↔ 45, 10 ↔ 50, 7 ↔ 53; 0 and 30 swap with each other.
  const mirrored = t.minute % 30 === 0 ? (t.minute + 30) % 60 : 60 - t.minute;
  const useNeighbour = tier >= 4 && rng() < 0.5;
  if (!useNeighbour) return { hour: t.hour, minute: mirrored };
  const candidates = minutesUpTo(tier).filter((m) => m !== t.minute);
  const closest = Math.min(...candidates.map((m) => circularDistance(m, t.minute)));
  // Stay within the same hour to keep the hour reading unchanged.
  const near = candidates.filter((m) => circularDistance(m, t.minute) === closest && Math.abs(m - t.minute) === closest);
  return { hour: t.hour, minute: pick(near.length ? near : [mirrored], rng) };
}

/** Clearly different minute from the same or an easier tier – not a close call. */
function easyAlternative(t: ClockTime, tier: Tier, rng: Rng): ClockTime {
  const candidates = minutesUpTo(tier).filter((m) => circularDistance(m, t.minute) >= 15);
  if (candidates.length === 0) return otherHour(t, rng);
  const lower = candidates.filter((m) => m % 15 === 0);
  return { hour: t.hour, minute: pick(lower.length ? lower : candidates, rng) };
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Builds three distinct answer options, exactly one correct.
 * The hour-error distractor shares the minute of the correct answer, so a new
 * minute value never singles out the right option on its own.
 */
export function buildOptions(correct: ClockTime, ctx: DistractorContext, rng: Rng): AnswerOption[] {
  const options: AnswerOption[] = [{ time: correct, kind: 'correct' }];
  const add = (time: ClockTime, kind: OptionKind): boolean => {
    if (options.some((o) => sameTime(o.time, time))) return false;
    options.push({ time, kind });
    return true;
  };

  add(hourError(correct, rng), 'hour');

  const sameMinuteRound = ctx.tier === 1 || rng() < 0.25;
  for (let attempt = 0; options.length < 3 && attempt < 20; attempt++) {
    if (sameMinuteRound) add(otherHour(correct, rng), 'otherHour');
    else if (ctx.advanced) add(minuteError(correct, ctx.tier, rng), 'minute');
    else add(easyAlternative(correct, ctx.tier, rng), 'easy');
  }
  while (options.length < 3) add(otherHour(correct, rng), 'otherHour');

  return shuffle(options, rng);
}

/**
 * Daytime track (context "Es ist Nachmittag"): the same clock reading before
 * noon is always one distractor, so the child has to use the context. Early on
 * the third option is clearly off (+3 hours), later it is the next hour.
 */
export function buildDaytimeOptions(correct: ClockTime, advanced: boolean, rng: Rng): AnswerOption[] {
  const offset = advanced ? 1 : 3;
  // Afternoon distractors stay within 13 and 23 Uhr.
  const hour = correct.hour + offset <= 11 ? correct.hour + offset : correct.hour - offset;
  return shuffle(
    [
      { time: correct, kind: 'correct', afternoon: true },
      { time: correct, kind: 'morning', afternoon: false },
      { time: { hour, minute: correct.minute }, kind: advanced ? 'hour' : 'otherHour', afternoon: true },
    ],
    rng,
  );
}
