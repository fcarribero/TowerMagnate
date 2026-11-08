import type { RngState, WindowPart } from '@tower-magnate/shared';
import { nextInt } from './rng';

/**
 * Draws a whole minute of the day from a weighted window (people spec 1.1): one draw for the
 * part by weight, then one for the minute inside the part.
 */
export function drawMinuteFromWindow(rng: RngState, parts: readonly WindowPart[]): number {
  const part = drawPart(rng, parts);
  return nextInt(rng, part.from, part.to - 1);
}

function drawPart(rng: RngState, parts: readonly WindowPart[]): WindowPart {
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  let remaining = nextInt(rng, 1, totalWeight);
  for (const part of parts) {
    remaining -= part.weight;
    if (remaining <= 0) return part;
  }
  throw new RangeError('A time window needs at least one part with weight');
}
