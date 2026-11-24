import type { GivenTime } from './engine';

/**
 * A time typed into two fields. The child says when the hour is done ("Minuten"):
 * a digit stays in the field it was typed into.
 */
export interface TimeEntry {
  hour: string;
  minute: string;
  field: 'hour' | 'minute';
}

export function emptyEntry(): TimeEntry {
  return { hour: '', minute: '', field: 'hour' };
}

/** The entry with the digit in the active field, or null if it does not fit there (no hour 30, no third digit). */
export function typeDigit(e: TimeEntry, d: number): TimeEntry | null {
  if (e.field === 'hour') {
    const hour = e.hour + String(d);
    return hour.length > 2 || Number(hour) > 23 ? null : { ...e, hour };
  }
  return e.minute.length >= 2 ? null : { ...e, minute: e.minute + String(d) };
}

/** On to the minutes, or null as long as there is no hour. */
export function toMinutes(e: TimeEntry): TimeEntry | null {
  return e.hour === '' ? null : { ...e, field: 'minute' };
}

export function toHour(e: TimeEntry): TimeEntry {
  return { ...e, field: 'hour' };
}

/** Deletes the last digit of the active field; from empty minutes it goes back to the hour. */
export function backspace(e: TimeEntry): TimeEntry {
  if (e.field === 'hour') return { ...e, hour: e.hour.slice(0, -1) };
  return e.minute === '' ? toHour(e) : { ...e, minute: e.minute.slice(0, -1) };
}

/** Hour and both minute digits are there. */
export function complete(e: TimeEntry): boolean {
  return e.hour !== '' && e.minute.length === 2;
}

export function toGiven(e: TimeEntry): GivenTime {
  return { hour: Number(e.hour), minute: Number(e.minute) };
}
