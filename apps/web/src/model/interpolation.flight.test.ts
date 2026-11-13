import { levelToIndex, type PersonView } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { flightBetween } from './interpolation';

const base = { level: 2, x: 10 } as PersonView;
const climbing = (done: number, up = true): PersonView =>
  ({ ...base, mode: 'stairs', flight: { done, steps: 12, up } }) as PersonView;
const landed: PersonView = { ...base, level: 3, x: 13, mode: 'walk' } as PersonView;

describe('flightBetween', () => {
  it('moves along the flight between two states on it', () => {
    const flight = flightBetween(climbing(2), climbing(4), 2, 0.5);
    expect(flight?.progress).toBeCloseTo(3 / 12);
    expect(flight?.walked).toBe(0);
  });

  it('starts at the beginning for a person first seen on the flight', () => {
    expect(flightBetween(undefined, climbing(0), 0, 0.7)?.progress).toBe(0);
    expect(flightBetween(undefined, climbing(2), 2, 0)?.progress).toBe(0);
  });

  it('is null off a flight', () => {
    expect(flightBetween(landed, landed, 2, 0.5)).toBeNull();
  });

  it('finishes the climb after the last state on the flight and then walks', () => {
    const before = climbing(11);
    const at = (progress: number) => flightBetween(before, landed, 3, progress);
    expect(at(0)?.progress).toBeCloseTo(11 / 12);
    expect(at(1 / 3)?.progress).toBeCloseTo(1);
    expect(at(1 / 3)?.walked).toBe(0);
    expect(at(2 / 3)?.walked).toBeCloseTo(0.5);
    expect(at(1)).toMatchObject({ progress: 1, walked: 1, level: 2 });
  });

  it('never jumps: the flight position is continuous over the whole climb', () => {
    let last = 0;
    for (let done = 0; done < 12; done += 2) {
      const before = climbing(done);
      const latest = done + 2 < 12 ? climbing(done + 2) : landed;
      for (const step of [0, 0.25, 0.5, 0.75, 1]) {
        const flight = flightBetween(before, latest, 2, step);
        const along = (flight?.progress ?? 0) + (flight?.walked ?? 0);
        expect(along).toBeGreaterThanOrEqual(last - 1e-9);
        expect(along - last).toBeLessThan(0.3);
        last = along;
      }
    }
  });

  it('stretches a short remainder over the delta when the exit lines up with it', () => {
    const flight = flightBetween(climbing(10), landed, 2, 0.5);
    expect(flight?.progress).toBeCloseTo(11 / 12);
    expect(flightBetween(climbing(10), landed, 2, 1)).toMatchObject({ progress: 1, walked: 0 });
  });

  it('keeps going down in the same terms', () => {
    const down = flightBetween(climbing(3, false), climbing(5, false), 2, 1);
    expect(down?.up).toBe(false);
    expect(down?.progress).toBeCloseTo(5 / 12);
    expect(levelToIndex(2)).toBeGreaterThanOrEqual(0);
  });
});
