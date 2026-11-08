import { describe, expect, it } from 'vitest';
import { stepAtHour } from './timeOfDay';
import { openVenuesAt } from './venueHours';

describe('openVenuesAt', () => {
  it('opens each venue only inside its hours', () => {
    expect([...openVenuesAt(stepAtHour(9))]).toEqual(['fast-food']);
    expect([...openVenuesAt(stepAtHour(12))].sort()).toEqual(['fast-food', 'retail-shop']);
    expect([...openVenuesAt(stepAtHour(18))].sort()).toEqual([
      'fast-food',
      'restaurant',
      'retail-shop',
    ]);
    expect([...openVenuesAt(stepAtHour(21))]).toEqual(['restaurant']);
    expect([...openVenuesAt(stepAtHour(23))]).toEqual([]);
    expect([...openVenuesAt(stepAtHour(3))]).toEqual([]);
  });

  it('closes a venue at its closing minute', () => {
    expect(openVenuesAt(stepAtHour(20) - 1).has('fast-food')).toBe(true);
    expect(openVenuesAt(stepAtHour(20)).has('fast-food')).toBe(false);
  });

  it('wraps to the next day', () => {
    expect(openVenuesAt(stepAtHour(24 * 3 + 12))).toBe(openVenuesAt(stepAtHour(12)));
  });

  it('returns the same set while the open venues stay the same', () => {
    expect(openVenuesAt(stepAtHour(10) + 1)).toBe(openVenuesAt(stepAtHour(16)));
  });
});
