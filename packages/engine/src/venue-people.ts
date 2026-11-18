import { PERSON_KINDS, type PersonKind, type TowerState, type Unit } from '@tower-magnate/shared';
import { isGuestAtVenue } from './hotel-guest-trip';
import { isMaid } from './housekeeping';
import { routineAt } from './office-routine';
import { NO_TRIP, personEntityId } from './people';
import { isPoliceOnDuty, policePhaseAt } from './police-phase';
import { decodeResidentRoutine } from './resident-routine';
import { staffRoutineAt } from './venue-staff';
import { customerTripAt } from './venue-visitors';
import { GUEST_INSIDE } from './wedding';

const KIND = (name: (typeof PERSON_KINDS)[number]) => PERSON_KINDS.indexOf(name);
const OFFICE_WORKER = KIND('officeWorker');
const RESIDENT = KIND('resident');
const CHILD = KIND('child');
const HOTEL_GUEST = KIND('hotelGuest');
const VIP = KIND('vip');
const STAFF = KIND('staff');
const WEDDING_GUEST = KIND('weddingGuest');

export interface UnitPeople {
  /** Person ids of the people who live in a condo or stay in a hotel room. */
  residents: string[];
  /** Person ids of office workers and shop or venue staff who belong to the unit. */
  workers: string[];
}

/** The people who belong to a unit, by role, as `p123` ids in increasing order. */
export function peopleOfUnit(state: TowerState, unit: Pick<Unit, 'id' | 'type'>): UnitPeople {
  const pool = state.people;
  const home = Number(unit.id.slice(1));
  const residents: string[] = [];
  const workers: string[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.homeUnit[slot] !== home) continue;
    const kind = pool.kind[slot];
    const id = personEntityId(pool.id[slot] as number);
    if (kind === OFFICE_WORKER || kind === STAFF) workers.push(id);
    else if (kind === RESIDENT || kind === CHILD || kind === HOTEL_GUEST || kind === VIP) {
      residents.push(id);
    }
  }
  return { residents, workers };
}

export interface VenuePeople {
  workers: string[];
  /** Crew members inside the unit working right now. */
  workersInside: number;
  /** Everyone inside as a customer: outside customers, office diners, residents and guests. */
  customers: string[];
}

/** Who works at a fast food, restaurant or shop and who is inside it as a customer right now. */
export function venuePeople(state: TowerState, unit: Pick<Unit, 'id' | 'type'>): VenuePeople {
  const pool = state.people;
  const venue = Number(unit.id.slice(1));
  const workers: string[] = [];
  const customers: string[] = [];
  let workersInside = 0;
  for (let slot = 0; slot < pool.id.length; slot++) {
    const id = personEntityId(pool.id[slot] as number);
    if (pool.homeUnit[slot] === venue && pool.kind[slot] === STAFF) {
      workers.push(id);
      if (staffRoutineAt(pool, slot)?.phase === 'working') workersInside += 1;
      continue;
    }
    if (pool.homeUnit[slot] === venue && customerTripAt(pool, slot)?.phase === 'atVenue') {
      customers.push(id);
    } else if (isGuestAtVenue(pool, slot, venue)) {
      customers.push(id);
    } else if (pool.kind[slot] === OFFICE_WORKER) {
      const routine = routineAt(pool, slot);
      if (routine?.phase === 'atLunch' && routine.venue === venue) customers.push(id);
    } else if (pool.kind[slot] === RESIDENT) {
      const routine = decodeResidentRoutine(pool.trip[slot] ?? NO_TRIP);
      if (routine?.phase === 'atVenue' && routine.venue === venue) customers.push(id);
    }
  }
  return { workers, workersInside, customers };
}

/** Person ids of the maids of one housekeeping unit, in increasing order. */
export function maidsOfUnit(state: TowerState, unit: Pick<Unit, 'id'>): string[] {
  const pool = state.people;
  const home = Number(unit.id.slice(1));
  const maids: string[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.homeUnit[slot] === home && isMaid(pool, slot)) {
      maids.push(personEntityId(pool.id[slot] as number));
    }
  }
  return maids;
}

/**
 * Person ids of the people of one kind who belong to a service unit and are in the tower, wherever
 * they work: officers off duty are at home, and doctors and cleaners leave the pool when they go.
 */
export function staffOfUnit(state: TowerState, unit: Pick<Unit, 'id'>, kind: PersonKind): string[] {
  const pool = state.people;
  const home = Number(unit.id.slice(1));
  const code = PERSON_KINDS.indexOf(kind);
  const people: string[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.homeUnit[slot] !== home || pool.kind[slot] !== code) continue;
    if (kind === 'police' && policePhaseAt(pool, slot) === 'off') continue;
    people.push(personEntityId(pool.id[slot] as number));
  }
  return people;
}

/** Person ids of the officers of one security office who are on duty right now. */
export function officersOnDuty(state: TowerState, unit: Pick<Unit, 'id'>): string[] {
  const pool = state.people;
  const home = Number(unit.id.slice(1));
  const officers: string[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.homeUnit[slot] === home && isPoliceOnDuty(pool, slot)) {
      officers.push(personEntityId(pool.id[slot] as number));
    }
  }
  return officers;
}

/**
 * Who is inside a party hall, a cathedral or a medical center as a visitor right now: party
 * guests, wedding guests who reached the cathedral, and office workers at a medical visit.
 */
export function visitorsOfUnit(state: TowerState, unit: Pick<Unit, 'id' | 'type'>): string[] {
  const pool = state.people;
  const home = Number(unit.id.slice(1));
  const visitors: string[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    const id = personEntityId(pool.id[slot] as number);
    if (pool.kind[slot] === WEDDING_GUEST) {
      if (pool.homeUnit[slot] === home && pool.trip[slot] === GUEST_INSIDE) visitors.push(id);
    } else if (pool.kind[slot] === OFFICE_WORKER) {
      const routine = routineAt(pool, slot);
      if (routine?.phase === 'atMedical' && routine.venue === home) visitors.push(id);
    } else if (pool.homeUnit[slot] === home && customerTripAt(pool, slot)?.phase === 'atVenue') {
      visitors.push(id);
    }
  }
  return visitors;
}
