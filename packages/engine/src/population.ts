import {
  CONDO_POPULATION,
  HOTEL_PARTY_SIZE,
  OFFICE_POPULATION,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { isVipStay } from './events/vip';

export interface PopulationBreakdown {
  offices: number;
  condos: number;
  hotel: number;
  venues: number;
  total: number;
}

const VIP_POPULATION = 1;

type HotelRoomType = keyof typeof HOTEL_PARTY_SIZE;

const COUNTED_VENUE_TYPES: ReadonlySet<Unit['type']> = new Set([
  'fast-food',
  'restaurant',
  'retail-shop',
]);

function isHotelRoomType(type: Unit['type']): type is HotelRoomType {
  return type in HOTEL_PARTY_SIZE;
}

function officePopulation(unit: Unit): number {
  return unit.type === 'office' && unit.lease ? OFFICE_POPULATION : 0;
}

function condoPopulation(unit: Unit): number {
  return unit.type === 'condo' && unit.sale ? CONDO_POPULATION : 0;
}

function hotelPopulation(state: TowerState, unit: Unit): number {
  if (!isHotelRoomType(unit.type) || unit.hotel?.stayEndStep == null) {
    return 0;
  }
  return isVipStay(state, unit.id) ? VIP_POPULATION : HOTEL_PARTY_SIZE[unit.type];
}

function venuePopulation(unit: Unit): number {
  if (!COUNTED_VENUE_TYPES.has(unit.type) || !unit.venue) {
    return 0;
  }
  return unit.venue.previousDayCount;
}

/** Population at the current step, computed from the tower's state (stars.md 3). */
export function populationOf(state: TowerState): PopulationBreakdown {
  const breakdown: PopulationBreakdown = { offices: 0, condos: 0, hotel: 0, venues: 0, total: 0 };
  for (const unit of Object.values(state.units)) {
    breakdown.offices += officePopulation(unit);
    breakdown.condos += condoPopulation(unit);
    breakdown.hotel += hotelPopulation(state, unit);
    breakdown.venues += venuePopulation(unit);
  }
  breakdown.total = breakdown.offices + breakdown.condos + breakdown.hotel + breakdown.venues;
  return breakdown;
}
