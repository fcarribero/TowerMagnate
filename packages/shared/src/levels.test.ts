import { describe, expect, it } from 'vitest';
import {
  CATHEDRAL_BOTTOM_LEVEL,
  HIGHEST_LEVEL,
  isColumn,
  isLevel,
  LAST_COLUMN,
  LEVEL_COUNT,
  levelAbove,
  levelBelow,
  levelToIndex,
  levelLabel,
  indexToLevel,
  LOWEST_BUILDABLE_LEVEL,
  LOWEST_LEVEL,
  TOP_FLOOR_LEVEL,
} from './levels';

describe('level range', () => {
  it('goes from the subway tunnel S10 to the top of the cathedral', () => {
    expect(LOWEST_LEVEL).toBe(-10);
    expect(LOWEST_BUILDABLE_LEVEL).toBe(-9);
    expect(TOP_FLOOR_LEVEL).toBe(100);
    expect(CATHEDRAL_BOTTOM_LEVEL).toBe(101);
    expect(HIGHEST_LEVEL).toBe(104);
    expect(LEVEL_COUNT).toBe(114);
  });

  it('has no level 0', () => {
    expect(isLevel(0)).toBe(false);
    expect(isLevel(-10)).toBe(true);
    expect(isLevel(104)).toBe(true);
    expect(isLevel(-11)).toBe(false);
    expect(isLevel(105)).toBe(false);
    expect(isLevel(1.5)).toBe(false);
  });

  it('has columns 0 to 374', () => {
    expect(LAST_COLUMN).toBe(374);
    expect(isColumn(0)).toBe(true);
    expect(isColumn(374)).toBe(true);
    expect(isColumn(-1)).toBe(false);
    expect(isColumn(375)).toBe(false);
    expect(isColumn(2.5)).toBe(false);
  });
});

describe('dense level index', () => {
  it('maps S10 to 0, S1 and floor 1 next to each other, and 104 to 113', () => {
    expect(levelToIndex(-10)).toBe(0);
    expect(levelToIndex(-1)).toBe(9);
    expect(levelToIndex(1)).toBe(10);
    expect(levelToIndex(104)).toBe(113);
  });

  it('round-trips every level', () => {
    for (let index = 0; index < LEVEL_COUNT; index += 1) {
      expect(levelToIndex(indexToLevel(index))).toBe(index);
    }
  });

  it('rejects levels and indexes off the grid', () => {
    expect(() => levelToIndex(0)).toThrow(RangeError);
    expect(() => indexToLevel(114)).toThrow(RangeError);
    expect(() => indexToLevel(-1)).toThrow(RangeError);
  });
});

describe('neighbour levels', () => {
  it('steps over the ground line without a level 0', () => {
    expect(levelAbove(-1)).toBe(1);
    expect(levelBelow(1)).toBe(-1);
    expect(levelAbove(100)).toBe(101);
  });

  it('returns null past the ends of the grid', () => {
    expect(levelAbove(104)).toBeNull();
    expect(levelBelow(-10)).toBeNull();
  });
});

describe('levelLabel', () => {
  it('names basements S1 to S10', () => {
    expect(levelLabel(-1)).toBe('S1');
    expect(levelLabel(-10)).toBe('S10');
    expect(levelLabel(42)).toBe('42');
  });
});
