import {
  countPeopleOfUnit,
  filmAgeDays as engineFilmAgeDays,
  housekeepingSummary,
  isOutsideTower,
  NO_TRIP,
  occupantAt,
  parsePersonId,
  personAt,
  slotOfPerson,
  STEPS_PER_MINUTE,
  STEPS_PER_WEEK,
  trekPhaseAt,
} from '@tower-magnate/engine';
import {
  LEASE_CONTRACT_WEEKS,
  UNIT_CATALOG,
  type InspectData,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';

import { modeOfPhase, stressLevel } from './snapshot';

type PersonInspection = Extract<InspectData, { kind: 'person'; status: 'ok' }>;
type ShaftInspection = Extract<InspectData, { kind: 'shaft'; status: 'ok' }>;
type UnitInspection = Extract<InspectData, { kind: 'unit'; status: 'ok' }>;
type UnitDetails = UnitInspection['details'];

/** What the unit window shows for one unit, or a `gone` answer when there is no such unit. */
export function inspectUnit(state: TowerState, unitId: string): InspectData {
  const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
  if (!unit) {
    return inspectSite(state, unitId);
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

/** A unit still being built shows its name, place and that it is under construction. */
function inspectSite(state: TowerState, siteId: string): InspectData {
  const site = Object.hasOwn(state.sites, siteId) ? state.sites[siteId] : undefined;
  if (!site) {
    return { kind: 'unit', id: siteId, status: 'gone' };
  }
  return {
    kind: 'unit',
    id: site.id,
    status: 'ok',
    name: null,
    type: site.type,
    level: site.level,
    from: site.x,
    to: site.x + UNIT_CATALOG[site.type].width - 1,
    details: { group: 'construction' },
  };
}

/** What the elevator window shows for one shaft, or a `gone` answer when there is no such shaft. */
export function inspectShaft(state: TowerState, shaftId: string): InspectData {
  const shaft = Object.hasOwn(state.shafts, shaftId) ? state.shafts[shaftId] : undefined;
  if (!shaft) {
    return { kind: 'shaft', id: shaftId, status: 'gone' };
  }
  const result: ShaftInspection = {
    kind: 'shaft',
    id: shaft.id,
    status: 'ok',
    type: shaft.type,
    bottom: shaft.bottom,
    top: shaft.top,
    stops: [...shaft.stops],
    cars: shaft.cars.map((car, index) => ({
      index,
      homeLevel: car.homeLevel,
      load: car.riders.length,
    })),
    schedule: shaft.schedule,
  };
  return result;
}

/** What the person window shows for one person, or a `gone` answer when the person is not in the tower. */
export function inspectPerson(state: TowerState, personId: string): InspectData {
  const pool = state.people;
  const number = parsePersonId(personId);
  const slot = number === null ? -1 : slotOfPerson(pool, number);
  if (slot < 0) {
    return { kind: 'person', id: personId, status: 'gone' };
  }
  const person = personAt(pool, slot);
  const phase = trekPhaseAt(pool, slot);
  const result: PersonInspection = {
    kind: 'person',
    id: person.id,
    status: 'ok',
    name: person.name,
    personKind: person.kind,
    state: personState(state, slot, phase, person.trip),
    destination: phase === 'idle' ? null : destinationOf(state, slot),
    stressMinutes: person.stress / STEPS_PER_MINUTE,
    stress: stressLevel(person.stress),
    homeUnitId: person.homeUnit,
  };
  return result;
}

function personState(
  state: TowerState,
  slot: number,
  phase: ReturnType<typeof trekPhaseAt>,
  trip: number,
): PersonInspection['state'] {
  if (isOutsideTower(state.people, slot)) {
    return 'outside';
  }
  return phase === 'noRoute' ? 'noRoute' : modeOfPhase(phase, trip === NO_TRIP);
}

/** The unit the person's trip ends in, or the exit when it ends anywhere else. */
function destinationOf(state: TowerState, slot: number): PersonInspection['destination'] {
  const level = state.people.trekLevel[slot] ?? 0;
  const column = state.people.trekColumn[slot] ?? 0;
  const occupant = occupantAt(state.grid, level, column);
  if (occupant?.kind === 'unit') {
    return { kind: 'unit', unitId: occupant.id, level };
  }
  return { kind: 'exit' };
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
      return cinemaDetails(state, unit);
    case 'housekeeping':
      return housekeepingDetails(state, unit);
    default:
      return null;
  }
}

function cinemaDetails(state: TowerState, unit: Unit): UnitDetails {
  const filmAgeDays = engineFilmAgeDays(state, unit);
  return {
    group: 'cinema',
    filmWeek: filmAgeDays === null ? null : Math.floor(filmAgeDays / 7) + 1,
    filmAgeDays,
    price: unit.priceLevel,
  };
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
    evaluation: unit.evaluation,
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
    evaluation: unit.evaluation,
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
    evaluation: unit.evaluation,
    price: unit.priceLevel,
    checkoutStep: occupied ? (room?.stayEndStep ?? null) : null,
  };
}

function housekeepingDetails(state: TowerState, unit: Unit): UnitDetails {
  const summary = housekeepingSummary(state, unit.id);
  return {
    group: 'housekeeping',
    maidsWorking: summary.working,
    maids: summary.maids,
    dirtyRooms: summary.dirtyRooms,
  };
}
