import { describe, expect, it } from 'vitest';
import { levelTop } from './levels';
import { personWorldPoint } from './personPoint';

describe('personWorldPoint', () => {
  it('puts the point in the middle of the tile column', () => {
    expect(personWorldPoint({ x: 10, level: 1 }).x).toBe(84);
  });

  it('puts the point halfway down the floor the person is on', () => {
    expect(personWorldPoint({ x: 0, level: 1 }).y).toBe(levelTop(10) + 16);
  });
});
