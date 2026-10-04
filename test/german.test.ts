import { describe, expect, it } from 'vitest';
import { formatSpoken, numberWord } from '../src/german';

describe('numberWord', () => {
  it.each([
    [1, 'eins'], [7, 'sieben'], [12, 'zwölf'], [16, 'sechzehn'], [17, 'siebzehn'],
    [20, 'zwanzig'], [21, 'einundzwanzig'], [25, 'fünfundzwanzig'], [29, 'neunundzwanzig'],
  ])('%i → %s', (n, word) => expect(numberWord(n)).toBe(word));
});

describe('formatSpoken', () => {
  it.each([
    [3, 0, 'drei Uhr'],
    [1, 0, 'ein Uhr'],
    [12, 0, 'zwölf Uhr'],
    [3, 15, 'Viertel nach drei'],
    [3, 30, 'halb vier'],
    [12, 30, 'halb eins'],
    [3, 45, 'Viertel vor vier'],
    [10, 15, 'Viertel nach zehn'],
    [2, 50, 'zehn vor drei'],
    [3, 10, 'zehn nach drei'],
    [3, 20, 'zwanzig nach drei'],
    [3, 40, 'zwanzig vor vier'],
    [3, 5, 'fünf nach drei'],
    [3, 25, 'fünfundzwanzig nach drei'],
    [3, 35, 'fünfundzwanzig vor vier'],
    [11, 55, 'fünf vor zwölf'],
    [12, 55, 'fünf vor eins'],
    [3, 7, 'sieben Minuten nach drei'],
    [3, 53, 'sieben Minuten vor vier'],
    [3, 1, 'eine Minute nach drei'],
    [3, 59, 'eine Minute vor vier'],
    [3, 23, 'dreiundzwanzig Minuten nach drei'],
  ])('%i:%i → %s', (hour, minute, text) => expect(formatSpoken({ hour, minute })).toBe(text));

  it('maps every time of a 12-hour clock to a distinct phrase', () => {
    const phrases = new Set<string>();
    for (let h = 1; h <= 12; h++) for (let m = 0; m < 60; m++) phrases.add(formatSpoken({ hour: h, minute: m }));
    expect(phrases.size).toBe(720);
  });
});
