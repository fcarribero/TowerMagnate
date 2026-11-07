import { describe, expect, it } from 'vitest';
import {
  HIGHEST_LEVEL,
  indexToLevel,
  isLevel,
  LEVEL_COUNT,
  levelToIndex,
  LOWEST_LEVEL,
} from './levels';

describe('levels', () => {
  it('has 114 levels from -10 to 104 without a level 0', () => {
    expect(LEVEL_COUNT).toBe(114);
    expect(isLevel(LOWEST_LEVEL)).toBe(true);
    expect(isLevel(HIGHEST_LEVEL)).toBe(true);
    expect(isLevel(0)).toBe(false);
    expect(isLevel(-11)).toBe(false);
    expect(isLevel(105)).toBe(false);
    expect(isLevel(1.5)).toBe(false);
    expect(isLevel('1')).toBe(false);
  });

  it('maps levels to consecutive dense indexes across the ground', () => {
    expect(levelToIndex(-10)).toBe(0);
    expect(levelToIndex(-1)).toBe(9);
    expect(levelToIndex(1)).toBe(10);
    expect(levelToIndex(104)).toBe(113);
  });

  it('round-trips every index', () => {
    for (let index = 0; index < LEVEL_COUNT; index++) {
      expect(levelToIndex(indexToLevel(index))).toBe(index);
    }
  });

  it('refuses values outside the tower', () => {
    expect(() => levelToIndex(0)).toThrow(RangeError);
    expect(() => levelToIndex(105)).toThrow(RangeError);
    expect(() => indexToLevel(-1)).toThrow(RangeError);
    expect(() => indexToLevel(LEVEL_COUNT)).toThrow(RangeError);
  });
});
