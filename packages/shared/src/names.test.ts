import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, normalizeName } from './names';

describe('normalizeName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeName('  Oficinas Sosa  ')).toBe('Oficinas Sosa');
  });

  it('keeps a name of exactly 24 characters', () => {
    const name = 'a'.repeat(MAX_NAME_LENGTH);
    expect(normalizeName(name)).toBe(name);
  });

  it('cuts a longer name to 24 characters after trimming', () => {
    expect(normalizeName(`   ${'b'.repeat(30)}   `)).toBe('b'.repeat(24));
  });

  it('does not leave a trailing space after cutting', () => {
    expect(normalizeName(`${'c'.repeat(23)} dddd`)).toBe('c'.repeat(23));
  });

  it('counts characters, not UTF-16 units', () => {
    const name = 'ñ'.repeat(10) + '🏢'.repeat(20);
    expect(Array.from(normalizeName(name) ?? '')).toHaveLength(24);
  });

  it('collapses line breaks and tabs into single spaces', () => {
    expect(normalizeName('Café\n\tCentral')).toBe('Café Central');
  });

  it('drops control characters', () => {
    expect(normalizeName('Hotel\u0000\u0007 Plaza')).toBe('Hotel Plaza');
  });

  it('returns null for an empty or blank name', () => {
    expect(normalizeName('')).toBeNull();
    expect(normalizeName('   \n ')).toBeNull();
  });
});
