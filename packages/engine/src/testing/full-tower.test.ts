import { describe, expect, it } from 'vitest';
import { peopleCount } from '../people';
import { FULL_TOWER_PEOPLE, fullTower } from './full-tower';

describe('fullTower', () => {
  it('holds 15,000 people on 100 floors', () => {
    const state = fullTower();
    const levels = Object.values(state.units).map((unit) => unit.level);

    expect(peopleCount(state.people)).toBe(FULL_TOWER_PEOPLE);
    expect(Math.max(...levels)).toBeLessThanOrEqual(100);
  });
});
