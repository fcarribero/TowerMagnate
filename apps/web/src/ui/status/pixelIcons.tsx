/** Small pixel pictures, one string per row, `#` for a drawn pixel. */
export type PixelPattern = readonly string[];

export const MAP_ICON: PixelPattern = [
  '########',
  '#..#...#',
  '#..#.#.#',
  '####...#',
  '#...####',
  '#.#.#..#',
  '#...#..#',
  '########',
];

export const FINANCE_ICON: PixelPattern = [
  '......##',
  '......##',
  '...##.##',
  '...##.##',
  '##.##.##',
  '##.##.##',
  '........',
  '########',
];

export const FOLLOWED_ICON: PixelPattern = [
  '..####..',
  '..####..',
  '..####..',
  '...##...',
  '.######.',
  '#.####.#',
  '..#..#..',
  '..#..#..',
];

export const NOTICES_ICON: PixelPattern = [
  '...##...',
  '...##...',
  '...##...',
  '...##...',
  '...##...',
  '........',
  '...##...',
  '...##...',
];

export const STAR_FILLED: PixelPattern = [
  '...#...',
  '..###..',
  '#######',
  '.#####.',
  '..###..',
  '.##.##.',
  '##...##',
];

/** Keeps only the pixels that touch the outside of the shape. */
export function outlineOf(pattern: PixelPattern): PixelPattern {
  const isSet = (row: number, column: number): boolean => pattern[row]?.[column] === '#';
  const isInside = (row: number, column: number): boolean =>
    isSet(row - 1, column) &&
    isSet(row + 1, column) &&
    isSet(row, column - 1) &&
    isSet(row, column + 1);
  return pattern.map((line, row) =>
    [...line]
      .map((_, column) => (isSet(row, column) && !isInside(row, column) ? '#' : '.'))
      .join(''),
  );
}

/** Alarm light, 16 x 16 pixels, for alert notices on the news line. */
export const ALARM_ICON: PixelPattern = [
  '................',
  '.......##.......',
  '.....######.....',
  '....########....',
  '...##########...',
  '...##########...',
  '...##########...',
  '...##########...',
  '...##########...',
  '..############..',
  '..############..',
  '.##############.',
  '.##############.',
  '.##############.',
  '................',
  '................',
];

/** Each pixel becomes a square of `factor` pixels. */
export function enlarge(pattern: PixelPattern, factor: number): PixelPattern {
  return pattern.flatMap((line) => {
    const wide = [...line].map((pixel) => pixel.repeat(factor)).join('');
    return Array.from({ length: factor }, () => wide);
  });
}

/** The star at 14 x 14 pixels, so its outline is 1 pixel wide on a 14 px slot. */
export const STAR_OUTLINE: PixelPattern = outlineOf(enlarge(STAR_FILLED, 2));

interface PixelIconProps {
  pattern: PixelPattern;
  class?: string;
}

export function PixelIcon({ pattern, class: className }: PixelIconProps) {
  const width = pattern[0]?.length ?? 0;
  return (
    <svg
      class={className}
      viewBox={`0 0 ${width} ${pattern.length}`}
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      {pattern.flatMap((line, y) =>
        [...line].map((pixel, x) =>
          pixel === '#' ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} /> : null,
        ),
      )}
    </svg>
  );
}
