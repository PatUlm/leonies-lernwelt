import { formatSpoken } from './german';
import type { ClockTime } from './time';

/** Time-of-day context shown next to the clock in the daytime track. */
export type DayContext = 'afternoon' | 'forenoon' | 'evening' | 'noon' | 'night';

/** Clock hours (1–12) that belong to each context. */
export const CONTEXT_HOURS: Record<DayContext, readonly number[]> = {
  afternoon: [1, 2, 3, 4, 5, 6], // 13–18 Uhr
  forenoon: [7, 8, 9, 10, 11], // 7–11 Uhr
  evening: [7, 8, 9, 10], // 19–22 Uhr
  noon: [12], // 12:xx
  night: [12], // 0:xx
};

/** 24-hour value of a clock hour in a context. */
export function hour24(context: DayContext, hour: number): number {
  switch (context) {
    case 'afternoon':
    case 'evening':
      return hour + 12;
    case 'forenoon':
      return hour;
    case 'noon':
      return 12;
    case 'night':
      return 0;
  }
}

export function contextSentence(context: DayContext, t: ClockTime): string {
  switch (context) {
    case 'afternoon':
      return 'Es ist Nachmittag.';
    case 'forenoon':
      return 'Es ist Vormittag.';
    case 'evening':
      return 'Es ist Abend.';
    case 'noon':
      return 'Es ist Mittag.';
    case 'night':
      return t.minute === 0 ? 'Es ist Mitternacht.' : 'Es ist kurz nach Mitternacht.';
  }
}

export const SUFFIX: Record<DayContext, string> = {
  afternoon: 'am Nachmittag',
  forenoon: 'am Vormittag',
  evening: 'am Abend',
  noon: 'am Mittag',
  night: 'in der Nacht',
};

/** "21:30 Uhr – halb zehn am Abend." */
export function contextConfirmation(context: DayContext, t: ClockTime): string {
  const written = `${hour24(context, t.hour)}:${String(t.minute).padStart(2, '0')} Uhr`;
  if (context === 'night' && t.minute === 0) return `${written} – Mitternacht.`;
  return `${written} – ${formatSpoken(t)} ${SUFFIX[context]}.`;
}
