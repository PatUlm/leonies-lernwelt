import { wrapHour, type ClockTime } from './time';

const UNITS = ['', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
const TEENS = [
  'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn',
  'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn',
];

/** German number word for 1–59 (as used for clock values). */
export function numberWord(n: number): string {
  if (n < 1 || n > 59 || !Number.isInteger(n)) throw new RangeError(`unsupported number ${n}`);
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  const tens = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig'][Math.floor(n / 10)];
  const unit = n % 10;
  if (unit === 0) return tens;
  return `${unit === 1 ? 'ein' : UNITS[unit]}und${tens}`;
}

const NAMED_PAST: Record<number, string> = {
  5: 'fünf', 10: 'zehn', 15: 'Viertel', 20: 'zwanzig', 25: 'fünfundzwanzig',
};

function minutesPhrase(m: number): string {
  if (m in NAMED_PAST) return NAMED_PAST[m];
  return m === 1 ? 'eine Minute' : `${numberWord(m)} Minuten`;
}

/** Minutes said relative to the half hour in the "halb" style ("fünf vor halb vier"). */
const HALF_STYLE: Record<number, string> = {
  20: 'zehn vor halb', 25: 'fünf vor halb', 35: 'fünf nach halb', 40: 'zehn nach halb',
};

export interface SpokenOptions {
  /** Say :20, :25, :35 and :40 relative to the half hour (regional, e.g. "fünf vor halb vier"). */
  half?: boolean;
}

/**
 * Colloquial German reading, e.g. "Viertel nach drei", "halb vier", "zehn vor drei".
 * One canonical phrase per time and style, so distinct times never share a phrase.
 */
export function formatSpoken(t: ClockTime, opts: SpokenOptions = {}): string {
  const { hour, minute } = t;
  const next = wrapHour(hour + 1);
  if (opts.half && minute in HALF_STYLE) return `${HALF_STYLE[minute]} ${numberWord(next)}`;
  if (minute === 0) return `${hour === 1 ? 'ein' : numberWord(hour)} Uhr`;
  if (minute === 30) return `halb ${numberWord(next)}`;
  if (minute < 30) return `${minutesPhrase(minute)} nach ${numberWord(hour)}`;
  return `${minutesPhrase(60 - minute)} vor ${numberWord(next)}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Same as formatSpoken, first letter upper-cased for buttons and sentences. */
export function formatSpokenCapitalized(t: ClockTime, opts: SpokenOptions = {}): string {
  return capitalize(formatSpoken(t, opts));
}
