/** A prop kind and its width in tiles; the sprite is `rooftop/<kind>` in the rooftop atlas. */
export interface RooftopKind {
  kind: string;
  widthTiles: number;
  /** Relative chance of being picked when it fits. */
  weight: number;
}

export const ROOFTOP_KINDS: readonly RooftopKind[] = [
  { kind: 'vent', widthTiles: 1, weight: 4 },
  { kind: 'antenna', widthTiles: 1, weight: 2 },
  { kind: 'stack', widthTiles: 1, weight: 2 },
  { kind: 'air-conditioner', widthTiles: 2, weight: 4 },
  { kind: 'dish', widthTiles: 2, weight: 2 },
  { kind: 'water-tank', widthTiles: 2, weight: 2 },
  { kind: 'air-conditioner-bank', widthTiles: 3, weight: 2 },
  { kind: 'penthouse', widthTiles: 3, weight: 1 },
];

export interface RooftopProp {
  kind: string;
  /** First tile column the prop covers. */
  column: number;
  widthTiles: number;
}

/** Tiles left empty at both ends of a roof, where the parapet corners are. */
const END_MARGIN_TILES = 1;
/** Tiles left empty after each prop. */
const GAP_TILES = 1;
/** Chance that a free tile is left bare instead of starting a prop. */
const BARE_CHANCE = 0.45;

/** A number in [0, 1) that depends only on its inputs. */
export function rooftopNoise(level: number, column: number, salt: number): number {
  let hash = Math.imul(level + 1000, 374761393) ^ Math.imul(column, 668265263);
  hash ^= Math.imul(salt + 1, 1442695041);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

/**
 * Props for one free roof span, `from` to `to` in tile columns, both included.
 * The same span on the same level always gives the same props. Choices depend
 * on the level and the column and scan from the left, so the props over the
 * first columns of a span stay put when the span grows to the right.
 */
export function planRooftopProps(
  level: number,
  span: { from: number; to: number },
  kinds: readonly RooftopKind[] = ROOFTOP_KINDS,
): RooftopProp[] {
  const props: RooftopProp[] = [];
  const last = span.to - END_MARGIN_TILES;
  let column = span.from + END_MARGIN_TILES;
  while (column <= last) {
    const room = last - column + 1;
    const fitting = kinds.filter((kind) => kind.widthTiles <= room);
    if (fitting.length === 0 || rooftopNoise(level, column, 0) < BARE_CHANCE) {
      column += 1;
      continue;
    }
    const choice = pick(fitting, rooftopNoise(level, column, 1));
    props.push({ kind: choice.kind, column, widthTiles: choice.widthTiles });
    column += choice.widthTiles + GAP_TILES;
  }
  return props;
}

function pick(kinds: readonly RooftopKind[], roll: number): RooftopKind {
  const total = kinds.reduce((sum, kind) => sum + kind.weight, 0);
  let left = roll * total;
  for (const kind of kinds) {
    left -= kind.weight;
    if (left < 0) {
      return kind;
    }
  }
  return kinds[kinds.length - 1] as RooftopKind;
}
