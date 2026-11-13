import { describe, expect, it } from 'vitest';
import { insideLook } from './insideMotion';

const unit = { from: 40, width: 9 };

describe('insideLook', () => {
  it('keeps the person inside the unit at any time', () => {
    for (let time = 0; time < 120_000; time += 137) {
      const { x } = insideLook('p1', unit, time, 2);
      expect(x).toBeGreaterThanOrEqual(unit.from);
      expect(x).toBeLessThanOrEqual(unit.from + unit.width - 2);
    }
  });

  it('is the same for the same person and time', () => {
    expect(insideLook('p1', unit, 5000, 2)).toEqual(insideLook('p1', unit, 5000, 2));
  });

  it('walks and stands in turn, and moves', () => {
    const looks = Array.from({ length: 600 }, (_, step) => insideLook('p7', unit, step * 100, 2));
    expect(looks.some((look) => look.walking)).toBe(true);
    expect(looks.some((look) => !look.walking)).toBe(true);
    expect(new Set(looks.map((look) => look.x)).size).toBeGreaterThan(5);
  });

  it('gives people in the same unit different routines', () => {
    const a = insideLook('p1', unit, 3000, 2);
    const others = ['p2', 'p3', 'p4', 'p5'].map((id) => insideLook(id, unit, 3000, 2).x);
    expect(others.some((x) => x !== a.x)).toBe(true);
  });

  it('stays put in a unit no wider than the person', () => {
    expect(insideLook('p1', { from: 10, width: 2 }, 4000, 2).x).toBe(10);
  });
});
