import {
  basePrice,
  DEFAULT_FAST_FOOD_HOURS,
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
  return {
    state: 'clean',
    stayEndStep: null,
    checkInStep: null,
    paidRatio: null,
    arrivalStep: null,
    rollDue: true,
    dirtyChecks: 0,
  };
}

export function isVenueType(type: UnitType): type is keyof typeof VENUE_PAYOUT_HOURS {
  return type in VENUE_PAYOUT_HOURS;
}

/** Units that keep daily visit counts: the paid venues and retail shops. */
export function holdsVenueDay(type: UnitType): boolean {
  return isVenueType(type) || type === 'retail-shop';
}

export function newVenueDay(): VenueDay {
  return {
    visits: 0,
    eveningShowVisits: 0,
    yesterday: null,
    countToday: 0,
    previousDayCount: 0,
    stressSum: 0,
    stressTrips: 0,
    customers: [],
    filmChangedAtStep: null,
    garbage: 0,
    garbageDay: -1,
  };
}

export function newUnit(id: EntityId, type: UnitType, x: number, level: Level): Unit {
  return {
    id,
    type,
    x,
    level,
    name: null,
    price: basePrice(type),
    appraisal: basePrice(type),
    // Offices go up for rent and condos for sale; shops wait until the player lists them.
    listed: type === 'office' || type === 'condo',
    enabled: true,
    activeToday: true,
    hours: type === 'fast-food' ? { ...DEFAULT_FAST_FOOD_HOURS } : null,
    paid: 0,
    placedAtStep: 0,
    used: false,
    lease: null,
    sale: null,
    hotel: isHotelRoomType(type) ? newHotelRoom() : null,
    evaluation: null,
    venue: holdsVenueDay(type) ? newVenueDay() : null,
  };
}

/** Unit types whose furniture the client builds from a seed (`Unit.look`). */
export const SEEDED_LOOK_TYPES: readonly UnitType[] = ['office'];

/**
 * The furniture seed of a unit: an FNV-1a hash of where and when it was built, so it does not
 * draw from the tower's random generator and every game gets its own looks.
 */
export function lookSeed(id: EntityId, x: number, level: Level, step: number): number {
  const text = `${id}:${x}:${level}:${step}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Gives a freshly built unit its furniture seed when its type has one. */
export function withLook(unit: Unit): Unit {
  return SEEDED_LOOK_TYPES.includes(unit.type)
    ? { ...unit, look: lookSeed(unit.id, unit.x, unit.level, unit.placedAtStep) }
    : unit;
}

/** Numeric part of a unit id, so `u9` sorts before `u10`. */
export function unitNumber(id: EntityId): number {
  return Number(id.slice(1));
}
