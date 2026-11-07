import type { RngState } from '@tower-magnate/shared';

const UINT32_RANGE = 0x1_0000_0000;
const WARM_UP_DRAWS = 12;

function splitMix32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x9e3779b9) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
    return (mixed ^ (mixed >>> 15)) >>> 0;
  };
}

export function createRng(seed: number): RngState {
  const nextSeedWord = splitMix32(seed);
  const rng: RngState = { a: nextSeedWord(), b: nextSeedWord(), c: nextSeedWord(), d: 1 };
  for (let draw = 0; draw < WARM_UP_DRAWS; draw++) {
    nextUint32(rng);
  }
  return rng;
}

/** Advances `rng` in place (sfc32). Only call it on a working copy of the state. */
export function nextUint32(rng: RngState): number {
  const sum = (((rng.a + rng.b) >>> 0) + rng.d) >>> 0;
  rng.d = (rng.d + 1) >>> 0;
  rng.a = (rng.b ^ (rng.b >>> 9)) >>> 0;
  rng.b = (rng.c + (rng.c << 3)) >>> 0;
  rng.c = ((rng.c << 21) | (rng.c >>> 11)) >>> 0;
  rng.c = (rng.c + sum) >>> 0;
  return sum;
}

/** A float in [0, 1). */
export function nextFloat(rng: RngState): number {
  return nextUint32(rng) / UINT32_RANGE;
}

/** An integer in [min, max]. */
export function nextInt(rng: RngState, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`Invalid integer range [${min}, ${max}]`);
  }
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

export function chance(rng: RngState, probability: number): boolean {
  return nextFloat(rng) < probability;
}
