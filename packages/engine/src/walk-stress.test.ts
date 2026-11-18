import { AMBIENT_WALK_COLUMNS_PER_STRESS } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { walkCellStress } from './trek';

describe('stress of walking along a level', () => {
  it('adds 1 for every 3 columns walked, whatever column the walk starts at', () => {
    expect(AMBIENT_WALK_COLUMNS_PER_STRESS).toBe(3);
    for (const start of [0, 1, 2, 17]) {
      let stress = 0;
      for (let column = start + 1; column <= start + 30; column++) stress += walkCellStress(column);
      expect(stress).toBe(10);
    }
  });
});
