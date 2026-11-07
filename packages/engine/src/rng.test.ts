import { describe, expect, it } from 'vitest';
import { chance, createRng, nextFloat, nextInt, nextUint32 } from './rng';

function draws(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => nextUint32(rng));
}

describe('seeded rng', () => {
  it('repeats the same sequence for the same seed', () => {
    expect(draws(42, 100)).toEqual(draws(42, 100));
  });

  it('gives different sequences for different seeds', () => {
    expect(draws(1, 10)).not.toEqual(draws(2, 10));
  });

  it('keeps all its state in plain JSON-safe data', () => {
    const rng = createRng(7);
    nextUint32(rng);
    const restored = JSON.parse(JSON.stringify(rng));
    expect(nextUint32(restored)).toBe(nextUint32(rng));
  });

  it('returns unsigned 32-bit integers', () => {
    for (const value of draws(3, 1000)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffff_ffff);
    }
  });

  it('returns floats in [0, 1) with a roughly even spread', () => {
    const rng = createRng(11);
    const buckets = new Array<number>(10).fill(0);
    for (let draw = 0; draw < 10_000; draw++) {
      const value = nextFloat(rng);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const bucket = Math.floor(value * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(900);
      expect(count).toBeLessThan(1100);
    }
  });

  it('returns integers inside an inclusive range and reaches both ends', () => {
    const rng = createRng(5);
    const seen = new Set<number>();
    for (let draw = 0; draw < 1000; draw++) {
      seen.add(nextInt(rng, -2, 2));
    }
    expect([...seen].sort((left, right) => left - right)).toEqual([-2, -1, 0, 1, 2]);
  });

  it('rejects an empty or fractional integer range', () => {
    const rng = createRng(5);
    expect(() => nextInt(rng, 3, 2)).toThrow(RangeError);
    expect(() => nextInt(rng, 0, 1.5)).toThrow(RangeError);
  });

  it('never succeeds with probability 0 and always succeeds with probability 1', () => {
    const rng = createRng(9);
    for (let draw = 0; draw < 100; draw++) {
      expect(chance(rng, 0)).toBe(false);
      expect(chance(rng, 1)).toBe(true);
    }
  });
});
