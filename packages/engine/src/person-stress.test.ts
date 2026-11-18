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
    [91, 'normal'],
    [92, 'alto'],
    [216, 'alto'],
    [217, 'muy alto'],
    [540, 'muy alto'],
  ] as const)('maps %i steps to %s by the 0 to 10 score', (stress, band) => {
    expect(stressBand(stress)).toBe(band);
  });
});

describe('venueStressFactor', () => {
  it('is 1 with no stress and falls by 0.04 per point of score', () => {
    expect(venueStressFactor(0)).toBe(1);
    expect(venueStressFactor(180)).toBeCloseTo(1 - 0.04 * 6.321, 3);
    expect(venueStressFactor(1e9)).toBeCloseTo(0.6, 3);
  });
});
