import { describe, expect, it } from 'vitest';
import { levelTop } from './levels';
import { bobOffset, pathPointInWorld } from './selectionMarker';
import { levelToIndex } from '@tower-magnate/shared';

describe('selection marker', () => {
  it('bobs between the rest row and two rows up', () => {
    const offsets = new Set<number>();
    for (let now = 0; now < 2000; now += 10) offsets.add(bobOffset(now));
    expect([...offsets].sort()).toEqual([0, 1, 2]);
    expect(bobOffset(0)).toBe(0);
    expect(bobOffset(450)).toBe(2);
  });

  it('runs the path through the centre of the cell, just above the floor', () => {
    expect(pathPointInWorld({ level: 3, x: 10 })).toEqual({
      x: 84,
      y: levelTop(levelToIndex(3)) + 27,
    });
  });
});
