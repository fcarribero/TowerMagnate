import {
  DEFAULT_PRICE_LEVEL,
  type EntityId,
  type HotelRoom,
  type Level,
  type Unit,
  type UnitType,
  type VenueDay,
  VENUE_PAYOUT_HOURS,
} from '@tower-magnate/shared';

const HOTEL_ROOM_TYPES: readonly UnitType[] = ['single-room', 'double-room', 'suite'];

export function isHotelRoomType(type: UnitType): boolean {
  return HOTEL_ROOM_TYPES.includes(type);
}

export function newHotelRoom(): HotelRoom {
  return { state: 'clean', stayEndStep: null };
}

export function isVenueType(type: UnitType): type is keyof typeof VENUE_PAYOUT_HOURS {
  return type in VENUE_PAYOUT_HOURS;
}

export function newVenueDay(): VenueDay {
  return { visits: 0, eveningShowVisits: 0, yesterday: null };
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
    venue: isVenueType(type) ? newVenueDay() : null,
  };
}

/** Numeric part of a unit id, so `u9` sorts before `u10`. */
export function unitNumber(id: EntityId): number {
  return Number(id.slice(1));
}
