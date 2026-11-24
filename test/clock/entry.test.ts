import { describe, expect, it } from 'vitest';
import { backspace, complete, emptyEntry, toGiven, toHour, toMinutes, typeDigit, type TimeEntry } from '../../src/modules/clock/entry';

/** Types digits, "m" for the "Minuten" key and "<" for backspace; a step that does not fit is left out. */
function type(keys: string, from: TimeEntry = emptyEntry()): TimeEntry {
  return [...keys].reduce((e, key) => {
    if (key === 'm') return toMinutes(e) ?? e;
    if (key === '<') return backspace(e);
    return typeDigit(e, Number(key)) ?? e;
  }, from);
}

const shown = (e: TimeEntry) => `${e.hour}:${e.minute}`;

describe('typing a time into two fields', () => {
  it('keeps every digit in the field it was typed into', () => {
    expect(['3', '3m', '3m0', '3m00'].map((k) => shown(type(k)))).toEqual(['3:', '3:', '3:0', '3:00']);
    expect(['1', '12', '12m', '12m0', '12m00'].map((k) => shown(type(k)))).toEqual(['1:', '12:', '12:', '12:0', '12:00']);
    expect(toGiven(type('1m05'))).toEqual({ hour: 1, minute: 5 });
    expect(toGiven(type('0m30'))).toEqual({ hour: 0, minute: 30 });
    // A leading zero is the same hour.
    expect(toGiven(type('03m00'))).toEqual({ hour: 3, minute: 0 });
  });

  it('takes no digit that does not fit the hour: the minutes need their key', () => {
    expect(typeDigit(type('3'), 0)).toBeNull();
    expect(typeDigit(type('12'), 0)).toBeNull();
    expect(typeDigit(type('2'), 4)).toBeNull();
    expect(type('23').hour).toBe('23');
    expect(shown(type('300'))).toBe('3:');
  });

  it('goes on to the minutes only with an hour, and takes two minute digits', () => {
    expect(toMinutes(emptyEntry())).toBeNull();
    expect(type('3m').field).toBe('minute');
    expect(typeDigit(type('3m00'), 5)).toBeNull();
  });

  it('is complete with an hour and both minute digits', () => {
    expect(['', '3', '3m', '3m0'].map((k) => complete(type(k)))).toEqual([false, false, false, false]);
    expect(complete(type('3m00'))).toBe(true);
    // Back in the hour field to correct it: the minutes stay.
    expect(complete(toHour(type('3m00')))).toBe(true);
    expect(complete(type('<', toHour(type('3m00'))))).toBe(false);
  });

  it('deletes in the active field and goes back to the hour from empty minutes', () => {
    expect(shown(type('12m30<'))).toBe('12:3');
    const back = type('12m3<<');
    expect(back).toEqual({ hour: '12', minute: '', field: 'hour' });
    expect(shown(type('<', back))).toBe('1:');
    // Correcting the hour leaves the minutes alone.
    expect(shown(type('<7', toHour(type('3m15'))))).toBe('7:15');
  });
});
