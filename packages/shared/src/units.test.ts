import { describe, expect, it } from 'vitest';
import { UNIT_CATALOG } from './balance';
import { SHAFT_TYPES, SHAFT_UNIT_TYPES } from './units';

describe('shaft types', () => {
  it('map to the elevator units of the catalog', () => {
    for (const shaftType of SHAFT_TYPES) {
      expect(UNIT_CATALOG[SHAFT_UNIT_TYPES[shaftType]].height.kind).toBe('shaft');
    }
  });
});
