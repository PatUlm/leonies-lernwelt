import { describe, expect, it } from 'vitest';
import { spokenGerman } from '../src/shared/spoken';

describe('spokenGerman', () => {
  it('says times with "Uhr" instead of leaving them to the speech engine', () => {
    expect(spokenGerman('Es ist 7:30 – halb acht.')).toBe('Es ist 7 Uhr 30 – halb acht.');
    expect(spokenGerman('Wähle 21:45 Uhr.')).toBe('Wähle 21 Uhr 45.');
    expect(spokenGerman('Tippe 1 5 0 0 – das ist 15:00.')).toBe('Tippe 1 5 0 0 – das ist 15 Uhr.');
    expect(spokenGerman('Es ist 9:05 – fünf nach neun.')).toBe('Es ist 9 Uhr 5 – fünf nach neun.');
  });

  it('does not say a full hour twice', () => {
    expect(spokenGerman('Es ist 3:00 – Drei Uhr.')).toBe('Es ist 3 Uhr.');
    expect(spokenGerman('Es ist 1:00 – ein Uhr.')).toBe('Es ist 1 Uhr.');
    expect(spokenGerman('15:00 Uhr – drei Uhr')).toBe('15 Uhr – drei Uhr');
  });

  it('leaves other numbers and spacing tidy', () => {
    expect(spokenGerman('  Der lange Zeiger zeigt auf die 12: volle Stunde. ')).toBe('Der lange Zeiger zeigt auf die 12: volle Stunde.');
  });
});
