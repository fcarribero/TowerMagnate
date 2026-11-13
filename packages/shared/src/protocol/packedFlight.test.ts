import { describe, expect, it } from 'vitest';
import { MAX_FLIGHT_STEPS, packFlight, unpackFlight } from '../flight';
import { packPerson, PackedPersonSchema, unpackPerson } from './packed';
import { PersonViewSchema } from './views';

const walker = {
  id: 'p7',
  kind: 'officeWorker',
  x: 10,
  level: 2,
  facing: 'right',
  mode: 'stairs',
  carRef: null,
  stress: 'normal',
} as const;

describe('flight progress in packed people', () => {
  it('round-trips for every length and step, up and down', () => {
    for (const up of [true, false]) {
      for (let steps = 1; steps <= MAX_FLIGHT_STEPS; steps += 1) {
        for (const done of [0, 1, steps - 1]) {
          expect(unpackFlight(packFlight({ done, steps, up }))).toEqual({ done, steps, up });
        }
      }
    }
  });

  it('stays out of the tuple and the person when there is no flight', () => {
    const packed = packPerson(walker);
    expect(packed).toHaveLength(10);
    expect(PackedPersonSchema.parse(packed)).toEqual(packed);
    expect(unpackPerson(packed)).toEqual(walker);
  });

  it('is the last tuple item when present and survives JSON', () => {
    const person = { ...walker, flight: { done: 5, steps: 12, up: false } };
    const packed = packPerson(person);
    expect(packed).toHaveLength(11);
    const parsed = PackedPersonSchema.parse(JSON.parse(JSON.stringify(packed)));
    expect(unpackPerson(parsed)).toEqual(person);
    expect(PersonViewSchema.parse(person)).toEqual(person);
  });

  it('still accepts the ten-item tuple an older server sends', () => {
    expect(PackedPersonSchema.safeParse([7, 0, 10, 2, 1, 3, 0, 0, 0, 0]).success).toBe(true);
    expect(PersonViewSchema.safeParse(walker).success).toBe(true);
  });

  it('rejects a flight past the longest length', () => {
    expect(
      PersonViewSchema.safeParse({ ...walker, flight: { done: 0, steps: 99, up: true } }).success,
    ).toBe(false);
  });
});
