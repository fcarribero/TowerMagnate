import { rooftopNoise } from './rooftopPlan';

/** A lobby prop kind and its width in tiles; the sprite is `lobby/<kind>` in the lobby atlas. */
export interface LobbyKind {
  kind: string;
  widthTiles: number;
  /** Relative chance of being picked when it fits. */
  weight: number;
  /** Also allowed in sky lobbies. */
  sky?: boolean;
}

export const LOBBY_KINDS: readonly LobbyKind[] = [
  { kind: 'side-table', widthTiles: 1, weight: 2 },
  { kind: 'armchair', widthTiles: 1, weight: 2 },
  { kind: 'plant-small', widthTiles: 1, weight: 3, sky: true },
  { kind: 'plant-tall', widthTiles: 1, weight: 3, sky: true },
  { kind: 'flower-vase', widthTiles: 1, weight: 2 },
  { kind: 'flower-pot', widthTiles: 1, weight: 2 },
  { kind: 'floor-lamp', widthTiles: 1, weight: 2 },
  { kind: 'notice-board', widthTiles: 1, weight: 1 },
  { kind: 'umbrella-stand', widthTiles: 1, weight: 1 },
  { kind: 'coffee-table', widthTiles: 2, weight: 2 },
  { kind: 'loveseat', widthTiles: 2, weight: 2 },
  { kind: 'bench', widthTiles: 2, weight: 2, sky: true },
  { kind: 'sofa', widthTiles: 3, weight: 2 },
  { kind: 'reception-desk', widthTiles: 3, weight: 1 },
];

/** Pictures hung on the lobby wall, above the furniture; the sprite is `lobby/<kind>`. */
export const LOBBY_PICTURES: readonly LobbyKind[] = [
  { kind: 'picture-hills', widthTiles: 2, weight: 2 },
  { kind: 'picture-sea', widthTiles: 2, weight: 2 },
  { kind: 'picture-portrait', widthTiles: 1, weight: 3 },
  { kind: 'picture-abstract', widthTiles: 1, weight: 2 },
  { kind: 'picture-vase', widthTiles: 1, weight: 2 },
  { kind: 'picture-mountains', widthTiles: 3, weight: 1 },
  { kind: 'picture-pair', widthTiles: 2, weight: 1 },
];

export interface LobbyProp {
  kind: string;
  /** First tile column the prop covers. */
  column: number;
  widthTiles: number;
}

export interface LobbyPlanOptions {
  /** Tiles left empty at both ends of the span; the main lobby keeps its door zone clear. */
  endMargin?: number;
  kinds?: readonly LobbyKind[];
}

/** Tiles left empty at both ends of a lobby run next to its walls or neighbors. */
const DEFAULT_END_MARGIN_TILES = 1;
/** Tiles kept clear at each end of a main lobby run, where the glass doors are. */
export const MAIN_LOBBY_END_MARGIN_TILES = 3;
/** Tiles left empty after each prop. */
const GAP_TILES = 1;
/** Chance that a free tile is left bare instead of starting a prop. */
const BARE_CHANCE = 0.65;
/** Salt offset that keeps lobby choices apart from rooftop choices. */
const SALT = 40;

/**
 * Props for one lobby run, `from` to `to` in tile columns, both included.
 * Choices depend only on the level and the column and scan from the left, so
 * the props over the first columns stay put when the run grows to the right.
 * A prop never repeats the kind right before it when another kind fits.
 */
export function planLobbyProps(
  level: number,
  span: { from: number; to: number },
  options: LobbyPlanOptions = {},
): LobbyProp[] {
  const margin = options.endMargin ?? DEFAULT_END_MARGIN_TILES;
  const kinds = options.kinds ?? LOBBY_KINDS;
  const props: LobbyProp[] = [];
  const last = span.to - margin;
  let column = span.from + margin;
  let previous = '';
  while (column <= last) {
    const room = last - column + 1;
    const fitting = kinds.filter((kind) => kind.widthTiles <= room);
    if (fitting.length === 0 || rooftopNoise(level, column, SALT) < BARE_CHANCE) {
      column += 1;
      continue;
    }
    const others = fitting.filter((kind) => kind.kind !== previous);
    const choice = pick(others.length > 0 ? others : fitting, rooftopNoise(level, column, SALT + 1));
    props.push({ kind: choice.kind, column, widthTiles: choice.widthTiles });
    previous = choice.kind;
    column += choice.widthTiles + GAP_TILES;
  }
  return props;
}

/** Salt offset for the pictures, apart from the furniture choices. */
const PICTURE_SALT = 60;
/** Chance that a free wall tile is left bare instead of starting a picture. */
const PICTURE_BARE_CHANCE = 0.55;
/** Tiles of bare wall between two pictures. */
const PICTURE_GAP_TILES = 2;

/**
 * Pictures for one lobby run, planned like the furniture but on their own noise, so a picture
 * can hang over a chair. They keep the same end margin and never repeat the kind before them.
 */
export function planLobbyPictures(
  level: number,
  span: { from: number; to: number },
  options: Pick<LobbyPlanOptions, 'endMargin'> = {},
): LobbyProp[] {
  const margin = options.endMargin ?? DEFAULT_END_MARGIN_TILES;
  const pictures: LobbyProp[] = [];
  const last = span.to - margin;
  let column = span.from + margin;
  let previous = '';
  while (column <= last) {
    const room = last - column + 1;
    const fitting = LOBBY_PICTURES.filter((kind) => kind.widthTiles <= room);
    if (fitting.length === 0 || rooftopNoise(level, column, PICTURE_SALT) < PICTURE_BARE_CHANCE) {
      column += 1;
      continue;
    }
    const others = fitting.filter((kind) => kind.kind !== previous);
    const choice = pick(
      others.length > 0 ? others : fitting,
      rooftopNoise(level, column, PICTURE_SALT + 1),
    );
    pictures.push({ kind: choice.kind, column, widthTiles: choice.widthTiles });
    previous = choice.kind;
    column += choice.widthTiles + PICTURE_GAP_TILES;
  }
  return pictures;
}

function pick(kinds: readonly LobbyKind[], roll: number): LobbyKind {
  const total = kinds.reduce((sum, kind) => sum + kind.weight, 0);
  let left = roll * total;
  for (const kind of kinds) {
    left -= kind.weight;
    if (left < 0) {
      return kind;
    }
  }
  return kinds[kinds.length - 1] as LobbyKind;
}
