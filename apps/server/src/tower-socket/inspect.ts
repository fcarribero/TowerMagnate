import { countPeopleOfUnit, STEPS_PER_WEEK } from '@tower-magnate/engine';
import {
  LEASE_CONTRACT_WEEKS,
  UNIT_CATALOG,
  type InspectData,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';

type UnitInspection = Extract<InspectData, { kind: 'unit'; status: 'ok' }>;
type UnitDetails = UnitInspection['details'];

/** What the unit window shows for one unit, or a `gone` answer when there is no such unit. */
export function inspectUnit(state: TowerState, unitId: string): InspectData {
  const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
  if (!unit) {
    return { kind: 'unit', id: unitId, status: 'gone' };
  }
  return {
    kind: 'unit',
    id: unit.id,
    status: 'ok',
    name: unit.name,
    type: unit.type,
    level: unit.level,
    from: unit.x,
    to: unit.x + UNIT_CATALOG[unit.type].width - 1,
    details: unitDetails(state, unit),
  };
}

function unitDetails(state: TowerState, unit: Unit): UnitDetails {
  switch (unit.type) {
    case 'office':
    case 'retail-shop':
      return leaseDetails(state, unit);
    case 'condo':
      return condoDetails(state, unit);
    case 'single-room':
    case 'double-room':
    case 'suite':
      return hotelDetails(state, unit);
    case 'cinema':
      return { group: 'cinema', filmWeek: null, filmAgeDays: null, price: unit.priceLevel };
    default:
      return null;
  }
}

function capacityOf(unit: Unit): number {
  return UNIT_CATALOG[unit.type].capacity?.people ?? 1;
}

function leaseDetails(state: TowerState, unit: Unit): UnitDetails {
  const { lease } = unit;
  const weeksIn = lease ? Math.floor((state.step - lease.anchorStep) / STEPS_PER_WEEK) + 1 : null;
  return {
    group: 'lease',
    state: lease ? 'occupied' : 'forRent',
    persons: countPeopleOfUnit(state.people, unit.id),
    capacity: capacityOf(unit),
    evaluation: null,
    price: unit.priceLevel,
    leaseWeek: weeksIn === null ? null : Math.min(weeksIn, LEASE_CONTRACT_WEEKS),
    nextPaymentStep: lease?.nextDueStep ?? null,
  };
}

function condoDetails(state: TowerState, unit: Unit): UnitDetails {
  return {
    group: 'condo',
    state: unit.sale ? 'sold' : 'forSale',
    residents: countPeopleOfUnit(state.people, unit.id),
    capacity: capacityOf(unit),
    evaluation: null,
    price: unit.priceLevel,
    nextEvaluationStep: unit.sale?.nextEvaluationStep ?? null,
  };
}

function hotelDetails(state: TowerState, unit: Unit): UnitDetails {
  const room = unit.hotel;
  const occupied = room?.state === 'occupied';
  return {
    group: 'hotel',
    state: room?.state ?? 'clean',
    guests: countPeopleOfUnit(state.people, unit.id),
    capacity: capacityOf(unit),
    evaluation: null,
    price: unit.priceLevel,
    checkoutStep: occupied ? (room?.stayEndStep ?? null) : null,
  };
}
