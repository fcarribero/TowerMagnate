import {
  DEFAULT_PRICE_LEVEL,
  HOTEL_NIGHTLY_PRICE,
  WEEKLY_RENT,
  type EntityId,
  type Level,
  type PriceLevel,
  type Unit,
  type UnitType,
} from '@tower-magnate/shared';

function hasPriceLevels(type: UnitType): boolean {
  return type in WEEKLY_RENT || type in HOTEL_NIGHTLY_PRICE || type === 'condo';
}

/** E-05: offices, shops, hotel rooms and condos start at normal; other units have no price. */
export function initialPriceLevel(type: UnitType): PriceLevel | null {
  return hasPriceLevels(type) ? DEFAULT_PRICE_LEVEL : null;
}

export function newUnit(id: EntityId, type: UnitType, x: number, level: Level): Unit {
  return {
    id,
    type,
    x,
    level,
    name: null,
    price: initialPriceLevel(type),
    used: false,
    lease: null,
  };
}

/** Numeric part of a unit id, so `u9` sorts before `u10`. */
export function unitNumber(id: EntityId): number {
  return Number(id.slice(1));
}
