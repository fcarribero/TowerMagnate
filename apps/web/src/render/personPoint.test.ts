import { describe, expect, it } from 'vitest';
import { levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import { personWorldPoint } from './personPoint';

describe('personWorldPoint', () => {
  it('maps the column to pixels and the level to the middle of its row', () => {
    const point = personWorldPoint(12.5, 3);
    expect(point.x).toBe(12.5 * TILE_WIDTH);
    expect(point.y).toBe(levelTop(levelToIndex(3)) + FLOOR_HEIGHT / 2);
  });

  it('puts a higher level above a lower one', () => {
    expect(personWorldPoint(0, 4).y).toBeLessThan(personWorldPoint(0, 3).y);
  });
});
