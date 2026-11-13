import { UNIT_CATALOG, type UnitType, type UnitView } from '@tower-magnate/shared';
import type { OverlayColor } from './overlayColors';
import type { SpriteVariant } from './spriteRegistry';
import { levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
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
}

export interface TransportSource {
  id: string;
  type: 'stairs' | 'escalator';
  x: number;
  level: number;
}

export type UnitSource = Pick<
  UnitView,
  'id' | 'type' | 'x' | 'level' | 'occupied' | 'variant' | 'price' | 'construction'
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
  const state = unitState(unit, openVenues);
  const drawing = footprint(unit.id, `units/${unit.type}`, unit, { state, time }, overlay);
  return unit.construction === undefined ? drawing : { ...drawing, construction: unit.construction };
}

const HOTEL_ROOMS: readonly UnitType[] = ['single-room', 'double-room', 'suite'];

function unitState(unit: UnitSource, openVenues: OpenVenues): string {
  const { type, variant } = unit;
  if (isVenue(type) && !openVenues.has(type)) {
    return 'closed';
  }
  if ((variant === 'dirty' || variant === 'infested') && HOTEL_ROOMS.includes(type)) {
    return variant;
  }
  if (variant === 'disconnected' && type === 'parking-space') {
    return variant;
  }
  return spriteState(type, unit.occupied || variant === 'occupied');
}

/** Shops and food venues are drawn open or busy instead of empty or occupied. */
const SHOP_STATES = { empty: 'open', occupied: 'busy' } as const;

/** Units whose sprites name their states differently from `empty` and `occupied`. */
const SPRITE_STATES: Partial<Record<UnitType, { empty: string; occupied: string }>> = {
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
  return footprint(transport.id, `transport/${transport.type}`, transport, variant, overlay);
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
