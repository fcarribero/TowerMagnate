/** Free columns that must separate two stairs on the same level. */
export const MIN_STAIRS_GAP = 8;

interface StairsSpan {
  x: number;
  level: number;
}

/** Whether stairs at `x` with `width` columns on `level` would sit closer than the minimum gap to any of `others`. */
export function stairsTooClose(
  others: Iterable<StairsSpan>,
  x: number,
  width: number,
  level: number,
): boolean {
  for (const other of others) {
    if (other.level !== level) continue;
    const gap = x < other.x ? other.x - (x + width) : x - (other.x + width);
    if (gap < MIN_STAIRS_GAP) return true;
  }
  return false;
}
