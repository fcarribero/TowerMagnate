import { describe, expect, it } from 'vitest';
import { debugStarsFromQuery } from './debugStars';

describe('debugStarsFromQuery', () => {
  it('reads a rating from 1 to 6', () => {
    expect(debugStarsFromQuery('?stars=3')).toBe(3);
    expect(debugStarsFromQuery('?x=1&stars=6')).toBe(6);
  });

  it('ignores missing or invalid values', () => {
    expect(debugStarsFromQuery('')).toBeNull();
    expect(debugStarsFromQuery('?stars=0')).toBeNull();
    expect(debugStarsFromQuery('?stars=7')).toBeNull();
    expect(debugStarsFromQuery('?stars=2.5')).toBeNull();
    expect(debugStarsFromQuery('?stars=abc')).toBeNull();
  });
});
