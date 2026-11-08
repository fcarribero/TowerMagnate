import {
  DEFAULT_PRICE_LEVEL,
  type EntityId,
  type HotelRoom,
  type Level,
  type Unit,
  type UnitType,
} from '@tower-magnate/shared';

const HOTEL_ROOM_TYPES: readonly UnitType[] = ['single-room', 'double-room', 'suite'];

export function isHotelRoomType(type: UnitType): boolean {
  return HOTEL_ROOM_TYPES.includes(type);
}

export function newHotelRoom(): HotelRoom {
  return { state: 'clean', stayEndStep: null, checkInStep: null, paidLevel: null };
}

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
    hotel: isHotelRoomType(type) ? newHotelRoom() : null,
    evaluation: null,
  };
}

/** Numeric part of a unit id, so `u9` sorts before `u10`. */
export function unitNumber(id: EntityId): number {
  return Number(id.slice(1));
}
