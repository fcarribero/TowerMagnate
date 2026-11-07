/** A floor number: -10..-1 for basements, 1..104 above ground. There is no level 0. */
export type Level = number;

export const LOWEST_LEVEL = -10;
export const HIGHEST_LEVEL = 104;

/** Number of levels, and so of dense indexes 0..LEVEL_COUNT - 1. */
export const LEVEL_COUNT = HIGHEST_LEVEL - LOWEST_LEVEL;

export function isLevel(value: unknown): value is Level {
  return (
    Number.isInteger(value) &&
    (value as number) !== 0 &&
    (value as number) >= LOWEST_LEVEL &&
    (value as number) <= HIGHEST_LEVEL
  );
}

/** Dense index without the missing level 0: 0 for level -10, 113 for level 104. */
export function levelToIndex(level: Level): number {
  if (!isLevel(level)) {
    throw new RangeError(`Not a level: ${level}`);
  }
  return level < 0 ? level - LOWEST_LEVEL : level - LOWEST_LEVEL - 1;
}

export function indexToLevel(index: number): Level {
  if (!Number.isInteger(index) || index < 0 || index >= LEVEL_COUNT) {
    throw new RangeError(`Not a level index: ${index}`);
  }
  const level = index + LOWEST_LEVEL;
  return level < 0 ? level : level + 1;
}
