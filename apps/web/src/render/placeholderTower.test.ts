import { describe, expect, it } from 'vitest';
import { TOWER_WIDTH_TILES } from './metrics';
import { placeholderTowerContent } from './placeholderTower';

describe('placeholderTowerContent', () => {
  it('has full-width structure rows and six offices per upper floor', () => {
    const content = placeholderTowerContent();
    for (const row of Object.values(content.levels)) {
      expect(row.structure).toHaveLength(TOWER_WIDTH_TILES);
    }
    expect(content.levels[1]?.structure).toContain('l');
    expect(content.units.filter((unit) => unit.level === 80)).toHaveLength(6);
  });
});
