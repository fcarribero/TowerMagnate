import { UNIT_CATALOG, type UnitType, type UnitView } from '@tower-magnate/shared';
import type { OverlayColor } from './overlayColors';
import type { SpriteVariant } from './spriteRegistry';
import { levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT, SLAB_HEIGHT, TILE_WIDTH } from './metrics';
import type { TimeOfDay } from './structurePlan';
import { ALL_VENUES_OPEN, isVenue, type OpenVenues } from './venueHours';

/** What the unit layer needs to draw one unit or transport, in world pixels. */
export interface UnitDrawing {
  id: string;
  /** Sprite path without state or time, such as `units/office`. */
  subject: string;
  variant: SpriteVariant;
  /** Dense index of the lowest level the footprint covers. */
  bottomIndex: number;
  /** Position inside the container of the bottom level. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Checker color drawn over the sprite, or null when it is drawn normally. */
  overlay: OverlayColor | null;
  /** Percent built while the unit is a construction site; undefined once it is built. */
  construction?: number;
  /** Drawn in front of the units on its level, as stairs and escalators are. */
  front?: boolean;
  /** Set when no route reaches the unit: the layer sticks a no-access sign on it. */
  noAccess?: boolean;
  /** Set on a built unit nobody has taken: the layer sticks a for rent or for sale tape on it. */
  availability?: 'rent' | 'sale';
  /**
   * Set when the sprite is bigger than the footprint: it is drawn at its own size, never
   * scaled, this many pixels from the footprint corner. The footprint still sizes the rest.
   */
  spriteOffset?: { x: number; y: number };
}

/** Pixels the stairs sprite reaches beyond each side of its footprint; matches the art tool. */
const STAIRS_MARGIN = 8;
const STAIRS_TOP_MARGIN = 8;

export interface TransportSource {
  id: string;
  type: 'stairs' | 'escalator';
  x: number;
  level: number;
}

export type UnitSource = Pick<
  UnitView,
  | 'id'
  | 'type'
  | 'x'
  | 'level'
  | 'occupied'
  | 'variant'
  | 'price'
  | 'construction'
  | 'inside'
  | 'leased'
>;

/** Units that are drawn here. Floors and lobbies are structure, elevators are shafts. */
export function isPlacedUnit(type: UnitType): boolean {
  const definition = UNIT_CATALOG[type];
  return (
    definition.category !== 'structure' &&
    definition.category !== 'transport' &&
    definition.height.kind === 'fixed'
  );
}

export function planUnit(
  unit: UnitSource,
  time: TimeOfDay,
  overlay: OverlayColor | null = null,
  openVenues: OpenVenues = ALL_VENUES_OPEN,
): UnitDrawing | null {
  if (!isPlacedUnit(unit.type)) {
    return null;
  }
  const building = unit.construction !== undefined;
  const state = unitState(
    building ? { ...unit, variant: 'empty', leased: true } : unit,
    openVenues,
  );
  const drawing = footprint(unit.id, `units/${unit.type}`, unit, { state, time }, overlay);
  const open = !building && state === 'empty' ? AVAILABILITY[unit.type] : undefined;
  const offered = open === undefined ? drawing : { ...drawing, availability: open };
  const marked = unit.variant === 'disconnected' ? { ...offered, noAccess: true } : offered;
  return unit.construction === undefined ? marked : { ...marked, construction: unit.construction };
}

/** What the tape on an untaken unit says: condos are sold, the rest are rented. */
const AVAILABILITY: Partial<Record<UnitType, 'rent' | 'sale'>> = {
  office: 'rent',
  condo: 'sale',
  'single-room': 'rent',
  'double-room': 'rent',
  suite: 'rent',
  'retail-shop': 'rent',
};

const HOTEL_ROOMS: readonly UnitType[] = ['single-room', 'double-room', 'suite'];

function unitState(unit: UnitSource, openVenues: OpenVenues): string {
  const { type, variant } = unit;
  if (type === 'retail-shop' && unit.leased !== true) {
    return 'empty';
  }
  if (isVenue(type) && !openVenues.has(type)) {
    return 'closed';
  }
  if ((variant === 'dirty' || variant === 'infested') && HOTEL_ROOMS.includes(type)) {
    return variant;
  }
  if (variant === 'disconnected' && type === 'parking-space') {
    return variant;
  }
  if (variant === 'sleeping' && SLEEPING_UNITS.includes(type)) return 'sleeping';
  const taken = unit.occupied || variant === 'occupied';
  if (RENTAL_UNITS.includes(type)) {
    // Not taken: the bare room. Taken with nobody in: furnished and dark. Someone in: lit.
    return !taken ? 'empty' : unit.inside === true ? 'occupied' : 'closed';
  }
  return spriteState(type, taken);
}

/** Units where people sleep: they have a fourth look, closed with someone in bed. */
const SLEEPING_UNITS: readonly UnitType[] = ['condo', 'single-room', 'double-room', 'suite'];

/** Units with three looks: bare when untaken, `closed` when taken and empty, `occupied` with people inside. Shops have their own states. */
const RENTAL_UNITS: readonly UnitType[] = [
  'office',
  'condo',
  'single-room',
  'double-room',
  'suite',
];

/** Shops and food venues are drawn open or busy instead of empty or occupied. */
const SHOP_STATES = { empty: 'open', occupied: 'busy' } as const;

/** Units whose sprites name their states differently from `empty` and `occupied`. */
const SERVICE_STATES = { empty: 'closed', occupied: 'occupied' } as const;

const SPRITE_STATES: Partial<Record<UnitType, { empty: string; occupied: string }>> = {
  security: SERVICE_STATES,
  'medical-center': SERVICE_STATES,
  'recycling-center': SERVICE_STATES,
  'subway-station': SERVICE_STATES,
  'parking-ramp': SERVICE_STATES,
  'parking-space': SERVICE_STATES,
  housekeeping: SERVICE_STATES,
  'fast-food': SHOP_STATES,
  restaurant: SHOP_STATES,
  'retail-shop': SHOP_STATES,
  cinema: { empty: 'empty', occupied: 'show' },
  'party-hall': { empty: 'empty', occupied: 'party' },
  cathedral: { empty: 'empty', occupied: 'wedding' },
};

/** The sprite state for an empty or occupied unit, such as `open` for an empty fast food. */
export function spriteState(type: UnitType, occupied: boolean): string {
  const states = SPRITE_STATES[type] ?? { empty: 'empty', occupied: 'occupied' };
  return occupied ? states.occupied : states.empty;
}

export function planTransport(
  transport: TransportSource,
  time: TimeOfDay,
  overlay: OverlayColor | null = null,
): UnitDrawing {
  const variant: SpriteVariant = transport.type === 'escalator' ? { time, frame: 1 } : { time };
  const drawing = footprint(
    transport.id,
    `transport/${transport.type}`,
    transport,
    variant,
    overlay,
  );
  if (transport.type === 'stairs') {
    // The stairs sprite runs from the floor of its level up to the floor of the level above.
    return {
      ...drawing,
      y: drawing.y - SLAB_HEIGHT,
      spriteOffset: { x: -STAIRS_MARGIN, y: -STAIRS_TOP_MARGIN },
      front: true,
    };
  }
  return { ...drawing, front: true };
}

function footprint(
  id: string,
  subject: string,
  placed: { type: UnitType; x: number; level: number },
  variant: SpriteVariant,
  overlay: OverlayColor | null,
): UnitDrawing {
  const definition = UNIT_CATALOG[placed.type];
  const floors = definition.height.kind === 'fixed' ? definition.height.floors : 1;
  const bottomIndex = levelToIndex(placed.level);
  return {
    id,
    subject,
    variant,
    bottomIndex,
    x: placed.x * TILE_WIDTH,
    y: levelTop(bottomIndex + floors - 1) - levelTop(bottomIndex),
    width: definition.width * TILE_WIDTH,
    height: floors * FLOOR_HEIGHT,
    overlay,
  };
}
