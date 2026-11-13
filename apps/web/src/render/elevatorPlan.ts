import type { Level, PersonKind, PersonView, ShaftType, ShaftView } from '@tower-magnate/shared';
import { indexToLevel, levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';

const SHAFT_TILES: Record<ShaftType, number> = { standard: 4, service: 4, express: 6 };
const CAR_SIZE: Record<ShaftType, { width: number; height: number }> = {
  standard: { width: 32, height: 32 },
  service: { width: 32, height: 32 },
  express: { width: 48, height: 32 },
};

const TOP_CAP_HEIGHT = 32;
/** Rows of the car sprite above the car floor where people stand. */
const CAR_FLOOR_ROW = 28;
const RIDER_HEIGHT = 16;
const CAR_WALL = 3;
const RIDER_SPACING = 5;

export interface ShaftPiece {
  sprite: string;
  /** Dense index of the level whose container holds the piece. */
  index: number;
  /** Position inside that container. */
  x: number;
  y: number;
}

/** Whether the structure rows have something built behind every column of the shaft on `level`. */
export function isBackedLevel(
  shaft: ShaftView,
  level: Level,
  structure: ReadonlyMap<Level, string>,
): boolean {
  const row = structure.get(level);
  if (row === undefined) return false;
  return !row.slice(shaft.x, shaft.x + SHAFT_TILES[shaft.type]).includes('.');
}

/** Changes whenever the backdrop of any level of the shaft does, so a drawn shaft knows to redraw. */
export function backdropKey(shaft: ShaftView, structure: ReadonlyMap<Level, string>): string {
  let key = '';
  for (let index = levelToIndex(shaft.bottom); index <= levelToIndex(shaft.top); index += 1) {
    key += isBackedLevel(shaft, indexToLevel(index), structure) ? 'b' : 'o';
  }
  return key;
}

export function shaftWidthPixels(type: ShaftType): number {
  return SHAFT_TILES[type] * TILE_WIDTH;
}

/**
 * The static parts of a shaft: a body on every level from bottom to top (brick where no
 * structure is built behind it, flat gray elsewhere), a hall
 * door frame on each stop, the machine room above the top level and the pit below the bottom one.
 */
export function planShaft(shaft: ShaftView, structure: ReadonlyMap<Level, string>): ShaftPiece[] {
  const x = shaft.x * TILE_WIDTH;
  const prefix = `transport/${shaft.type}-shaft`;
  const bottom = levelToIndex(shaft.bottom);
  const top = levelToIndex(shaft.top);
  const stops = new Set(shaft.stops.map(levelToIndex));
  const pieces: ShaftPiece[] = [];
  for (let index = bottom; index <= top; index += 1) {
    const backed = isBackedLevel(shaft, indexToLevel(index), structure);
    pieces.push({ sprite: `${prefix}/${backed ? 'body' : 'brick'}`, index, x, y: 0 });
    if (stops.has(index)) {
      pieces.push({ sprite: `${prefix}/landing`, index, x, y: 0 });
    }
  }
  pieces.push({ sprite: `${prefix}/top`, index: top, x, y: -TOP_CAP_HEIGHT });
  pieces.push({ sprite: `${prefix}/bottom`, index: bottom, x, y: FLOOR_HEIGHT });
  return pieces;
}

export function carSize(type: ShaftType): { width: number; height: number } {
  return CAR_SIZE[type];
}

/** World position of a car's top-left corner, with `position` as a dense level index that may be fractional. */
export function carOrigin(shaft: ShaftView, position: number): { x: number; y: number } {
  const size = CAR_SIZE[shaft.type];
  const x = shaft.x * TILE_WIDTH + (shaftWidthPixels(shaft.type) - size.width) / 2;
  const y = levelTop(0) - position * FLOOR_HEIGHT + (FLOOR_HEIGHT - size.height);
  return { x: Math.round(x), y: Math.round(y) };
}

/** Whether a car at `position` shows on screen when levels `lowest` to `highest` (dense indexes) do. */
export function carInRange(position: number, range: { lowest: number; highest: number }): boolean {
  return position > range.lowest - 1 && position < range.highest + 1;
}

/** Door opening inside the car sprite, as the art tool draws it. */
const DOOR_INSET = 3;
const DOOR_TOP = 4;
const DOOR_BOTTOM = 28;
/** Width of a door leaf that is fully open, which the open car sprite already draws. */
const OPEN_LEAF = 2;

export function doorOpeningOf(size: { width: number; height: number }): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    left: DOOR_INSET,
    top: DOOR_TOP,
    width: size.width - 2 * DOOR_INSET,
    height: DOOR_BOTTOM - DOOR_TOP + 1,
  };
}

/** Pixel width of each door leaf with the doors `openness` open, 0 closed to 1 open. */
export function doorLeafWidth(type: ShaftType, openness: number): number {
  const closed = doorOpeningOf(CAR_SIZE[type]).width / 2;
  return Math.round(OPEN_LEAF + (closed - OPEN_LEAF) * (1 - openness));
}

/** Moves `openness` toward fully open or closed by `amount`, staying within 0 to 1. */
export function stepOpenness(openness: number, open: boolean, amount: number): number {
  return open ? Math.min(1, openness + amount) : Math.max(0, openness - amount);
}

export function riderSlotCount(type: ShaftType): number {
  return Math.floor((CAR_SIZE[type].width - 2 * CAR_WALL) / RIDER_SPACING);
}

/** Where the n-th rider of a car stands, inside the car's own coordinates. */
export function riderPlace(type: ShaftType, n: number): { x: number; y: number } {
  const slot = n % riderSlotCount(type);
  return { x: CAR_WALL + slot * RIDER_SPACING, y: CAR_FLOOR_ROW - RIDER_HEIGHT };
}

const SPRITE_NAME_OF_KIND: Record<PersonKind, string> = {
  officeWorker: 'worker',
  resident: 'resident',
  hotelGuest: 'guest',
  customer: 'customer',
  audience: 'guest',
  partyGuest: 'guest',
  maid: 'maid',
  guard: 'security',
  vip: 'vip',
  weddingGuest: 'guest',
  prospect: 'customer',
  builder: 'builder',
};

const LOOKS = ['a', 'b', 'c', 'd'];
const STRESS_SUFFIX: Record<PersonView['stress'], string> = {
  normal: '',
  stressed: '-pink',
  veryStressed: '-red',
};

function personSubject(person: PersonView): string {
  const look = LOOKS[Number(person.id.slice(1)) % LOOKS.length] ?? 'a';
  return `people/${SPRITE_NAME_OF_KIND[person.kind]}-${look}`;
}

/** Sprite subject and state of a person standing, with the look picked from the id. */
export function riderSprite(person: PersonView): { subject: string; state: string } {
  return { subject: personSubject(person), state: `stand${STRESS_SUFFIX[person.stress]}` };
}

/** Sprite of a person on a floor: standing while waiting, otherwise one of two walk frames. */
export function floorSprite(
  person: PersonView,
  column: number,
): { subject: string; state: string; frame?: number } {
  const subject = personSubject(person);
  const suffix = STRESS_SUFFIX[person.stress];
  if (person.mode === 'wait') {
    return { subject, state: `stand${suffix}` };
  }
  return { subject, state: `walk${suffix}`, frame: (Math.floor(column * 2) % 2) + 1 };
}
