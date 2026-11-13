import { PERSON_KINDS, type TowerState, type Unit } from '@tower-magnate/shared';
import { isGuestAtVenue } from './hotel-guest-trip';
import { routineAt } from './office-routine';
import { NO_TRIP, personEntityId } from './people';
import { decodeResidentRoutine } from './resident-routine';
import { staffRoutineAt } from './venue-staff';
import { customerTripAt } from './venue-visitors';

const KIND = (name: (typeof PERSON_KINDS)[number]) => PERSON_KINDS.indexOf(name);
const OFFICE_WORKER = KIND('officeWorker');
const RESIDENT = KIND('resident');
const CHILD = KIND('child');
const HOTEL_GUEST = KIND('hotelGuest');
const VIP = KIND('vip');
const STAFF = KIND('staff');

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
