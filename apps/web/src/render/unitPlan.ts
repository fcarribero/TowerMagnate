import { UNIT_CATALOG, type UnitType, type UnitView } from '@tower-magnate/shared';
import type { SpriteVariant } from './spriteRegistry';
import { levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import type { TimeOfDay } from './structurePlan';

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
}

export interface TransportSource {
  id: string;
  type: 'stairs' | 'escalator';
  x: number;
  level: number;
}

export type UnitSource = Pick<UnitView, 'id' | 'type' | 'x' | 'level' | 'occupied' | 'variant'>;

/** Units that are drawn here. Floors and lobbies are structure, elevators are shafts. */
export function isPlacedUnit(type: UnitType): boolean {
  const definition = UNIT_CATALOG[type];
  return (
    definition.category !== 'structure' &&
    definition.category !== 'transport' &&
    definition.height.kind === 'fixed'
  );
}

export function planUnit(unit: UnitSource, time: TimeOfDay): UnitDrawing | null {
  if (!isPlacedUnit(unit.type)) {
    return null;
  }
  const state = unit.occupied || unit.variant === 'occupied' ? 'occupied' : 'empty';
  return footprint(unit.id, `units/${unit.type}`, unit, { state, time });
}

export function planTransport(transport: TransportSource, time: TimeOfDay): UnitDrawing {
  const variant: SpriteVariant = transport.type === 'escalator' ? { time, frame: 1 } : { time };
  return footprint(transport.id, `transport/${transport.type}`, transport, variant);
}

function footprint(
  id: string,
  subject: string,
  placed: { type: UnitType; x: number; level: number },
  variant: SpriteVariant,
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
  };
}
