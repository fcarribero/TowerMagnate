import { describe, expect, it } from 'vitest';
import {
  canAddCar,
  canRemoveCar,
  hasChanges,
  homesOnStops,
  levelsBetween,
  offeredLevels,
  toggleStop,
} from './elevatorDraft';

describe('elevatorDraft', () => {
  it('skips level 0 between basements and ground', () => {
    expect(levelsBetween(-2, 2)).toEqual([-2, -1, 1, 2]);
  });

  it('offers every level on a standard shaft, top first', () => {
    expect(offeredLevels('standard', 1, 4)).toEqual([4, 3, 2, 1]);
  });

  it('offers only basements, level 1 and sky lobbies on an express shaft', () => {
    expect(offeredLevels('express', -2, 31)).toEqual([30, 15, 1, -1, -2]);
  });

  it('toggles a stop and keeps stops sorted', () => {
    expect(toggleStop([1, 15], 5)).toEqual([1, 5, 15]);
    expect(toggleStop([1, 5, 15], 5)).toEqual([1, 15]);
  });

  it('moves a car home to the lowest stop when its stop is removed', () => {
    expect(homesOnStops([1, 15, 30], [1, 30])).toEqual([1, 1, 30]);
  });

  it('detects changes in stops or homes', () => {
    const current = { stops: [1, 15], carHomes: [1] };
    expect(hasChanges(current, { stops: [1, 15], carHomes: [1] })).toBe(false);
    expect(hasChanges(current, { stops: [1], carHomes: [1] })).toBe(true);
    expect(hasChanges(current, { stops: [1, 15], carHomes: [15] })).toBe(true);
  });

  it('limits cars between 1 and 8', () => {
    expect(canAddCar(7)).toBe(true);
    expect(canAddCar(8)).toBe(false);
    expect(canRemoveCar(2)).toBe(true);
    expect(canRemoveCar(1)).toBe(false);
  });
});
