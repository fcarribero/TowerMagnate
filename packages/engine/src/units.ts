import {
  DEFAULT_PRICE_LEVEL,
  type EntityId,
  type Level,
  type Unit,
  type UnitType,
} from '@tower-magnate/shared';

export function newUnit(id: EntityId, type: UnitType, x: number, level: Level): Unit {
  return {
    id,
    type,
    x,
    level,
    name: null,
    priceLevel: DEFAULT_PRICE_LEVEL,
    paid: 0,
    placedAtStep: 0,
    used: false,
    lease: null,
    sale: null,
  };
}

/** Numeric part of a unit id, so `u9` sorts before `u10`. */
export function unitNumber(id: EntityId): number {
  return Number(id.slice(1));
}
