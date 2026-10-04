import { describe, expect, it } from 'vitest';
import { appTitle, genitive } from '../src/config';

describe('appTitle', () => {
  it('names the world after the profile', () => {
    expect(appTitle('Patrick')).toBe('Patricks Lernwelt');
    expect(appTitle('Leonie')).toBe('Leonies Lernwelt');
  });

  it('is neutral without a profile', () => {
    expect(appTitle(undefined)).toBe('Meine Lernwelt');
  });
});

describe('genitive', () => {
  it('takes an apostrophe after s, ß, z, x and ce', () => {
    expect(genitive('Klaus')).toBe("Klaus'");
    expect(genitive('Fritz')).toBe("Fritz'");
    expect(genitive('Max')).toBe("Max'");
    expect(genitive('Grace')).toBe("Grace'");
    expect(genitive('Strauß')).toBe("Strauß'");
  });
});
