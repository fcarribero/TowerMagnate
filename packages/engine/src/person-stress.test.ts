import { describe, expect, it } from 'vitest';
import { personStress, stressBand, venueStressFactor, type RecordedTrip } from './person-stress';

const STEP = 100_000;
const WEEK = 60_480;

function trips(...stresses: number[]): RecordedTrip[] {
  return stresses.map((stress) => ({ endStep: STEP - 10, stress }));
}

describe('personStress', () => {
  it('is 0 with no trips', () => {
    expect(personStress([], STEP)).toBe(0);
  });

  it('counts the trip in progress while waiting (92, alto)', () => {
    const twelve = trips(...Array<number>(12).fill(95));
    expect(twelve.reduce((sum, trip) => sum + trip.stress, 0)).toBe(1_140);
    const stress = personStress(twelve, STEP, 60);
    expect(stress).toBe(92);
    expect(stressBand(stress)).toBe('alto');
  });

  it('drops 4 trips once they leave the window (77, normal)', () => {
    const dropped = Array.from({ length: 4 }, () => ({ endStep: STEP - WEEK - 1, stress: 130 }));
    const kept = trips(...Array<number>(8).fill(0).fill(100, 0, 6).fill(10, 6));
    const justEnded = { endStep: STEP, stress: 75 };
    expect(kept.reduce((sum, trip) => sum + trip.stress, 0)).toBe(620);
    const stress = personStress([...dropped, ...kept, justEnded], STEP);
    expect(stress).toBe(77);
    expect(stressBand(stress)).toBe('normal');
  });

  it('keeps a trip ended exactly one week ago and drops one a step older', () => {
    const inside = [{ endStep: STEP - WEEK, stress: 100 }];
    const outside = [{ endStep: STEP - WEEK - 1, stress: 100 }];
    expect(personStress(inside, STEP)).toBe(100);
    expect(personStress(outside, STEP)).toBe(0);
  });

  it('rounds the average down', () => {
    expect(personStress(trips(10, 11), STEP)).toBe(10);
  });
});

describe('stressBand', () => {
  it.each([
    [0, 'normal'],
    [89, 'normal'],
    [90, 'alto'],
    [179, 'alto'],
    [180, 'muy alto'],
    [540, 'muy alto'],
  ] as const)('maps %i to %s', (stress, band) => {
    expect(stressBand(stress)).toBe(band);
  });
});

describe('venueStressFactor', () => {
  it.each([
    [0, 1],
    [89, 1],
    [90, 0.8],
    [179, 0.8],
    [180, 0.6],
  ])('gives the factor for %i', (average, factor) => {
    expect(venueStressFactor(average)).toBe(factor);
  });
});
