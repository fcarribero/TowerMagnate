import { describe, expect, it } from 'vitest';
import {
  HIGHEST_LEVEL,
  LEVEL_COUNT,
  LOWEST_LEVEL,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  indexAtWorldY,
  indexToLevel,
  levelToIndex,
  levelTop,
} from './levels';

describe('level index', () => {
  it('maps -10..104 to 0..113 without a level 0', () => {
    expect(LEVEL_COUNT).toBe(114);
    expect(levelToIndex(LOWEST_LEVEL)).toBe(0);
    expect(levelToIndex(-1)).toBe(9);
    expect(levelToIndex(1)).toBe(10);
    expect(levelToIndex(HIGHEST_LEVEL)).toBe(113);
  });

  it('round-trips every level', () => {
    for (let index = 0; index < LEVEL_COUNT; index += 1) {
      expect(levelToIndex(indexToLevel(index))).toBe(index);
    }
    expect(indexToLevel(9)).toBe(-1);
    expect(indexToLevel(10)).toBe(1);
  });
});

describe('world geometry', () => {
  it('is 375 tiles wide and 114 floors high', () => {
    expect(WORLD_WIDTH).toBe(3000);
    expect(WORLD_HEIGHT).toBe(3648);
  });

  it('puts the highest level at the top and the lowest at the bottom', () => {
    expect(levelTop(levelToIndex(HIGHEST_LEVEL))).toBe(0);
    expect(levelTop(levelToIndex(LOWEST_LEVEL))).toBe(WORLD_HEIGHT - 32);
  });

  it('finds the level under a world y', () => {
    expect(indexAtWorldY(0)).toBe(113);
    expect(indexAtWorldY(31)).toBe(113);
    expect(indexAtWorldY(32)).toBe(112);
    expect(indexAtWorldY(WORLD_HEIGHT - 1)).toBe(0);
  });
});
