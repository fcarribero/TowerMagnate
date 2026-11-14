import {
  CHANGE_CLOTHES_STEPS,
  LAST_COLUMN,
  ROUTE_RETRY_STEPS,
  SECURITY_ARRIVAL_LEAD_MINUTES,
  SECURITY_OFFICE_SPOTS,
  SECURITY_PATROL_STOP_MINUTES,
  SECURITY_PATROL_WEIGHTS,
  SECURITY_RELIEF_GRACE_MINUTES,
  SECURITY_SHIFT_HOURS,
  SECURITY_SHIFTS,
  SECURITY_SPOTS,
  UNIT_CATALOG,
  type Level,
  type PersonPool,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { occupantAt, structureAt } from './grid';
import { entrancePlace, type Place } from './office-routine';
import { addPerson, NO_TRIP, NOTHING_DUE, unitPeople } from './people';
import {
  decodePoliceRoutine,
  encodePoliceRoutine,
  isPhaseOnDuty,
  isPolice,
  policePhaseAt,
  type PolicePhase,
  type PoliceRoutine,
} from './police-phase';
import type { ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { nearestStreetColumn, streetColumn, streetPlace } from './street';
import { cancelTrek, isOnTrek, startTrek } from './trek';
import { unitNumber } from './units';

const SHIFT_STEPS = SECURITY_SHIFT_HOURS * STEPS_PER_HOUR;
const LEAD_STEPS = SECURITY_ARRIVAL_LEAD_MINUTES * STEPS_PER_MINUTE;
const GRACE_STEPS = SECURITY_RELIEF_GRACE_MINUTES * STEPS_PER_MINUTE;
const PATROL_TRIES = 8;
/** How many columns either side of a unit a patrol looks for open floor to stop on. */
const HALLWAY_REACH = 40;

export type PoliceSpot = 'office' | 'patrol';

/** Spots 0 to 2 stay inside the office, the others patrol the floors. */
export function spotKindOf(spot: number): PoliceSpot {
  return spot < SECURITY_OFFICE_SPOTS ? 'office' : 'patrol';
}

/** The shift that is on now: 0 from 00:00, 1 from 08:00, 2 from 16:00. */
export function currentShiftOf(step: number): number {
  return Math.floor((step % STEPS_PER_DAY) / SHIFT_STEPS) % SECURITY_SHIFTS;
}

/**
 * The officers of each security office in id order: the first 7 are the first shift, the next 7
 * the second, the last 7 the third. An officer's place in that list gives the shift and the spot
 * (the position inside the shift), so the roster needs no stored fields and old saves fit it.
 */
interface Roster {
  length: number;
  nextId: number;
  offices: Map<number, number[]>;
  shift: Uint8Array;
  spot: Uint8Array;
  /** The slot of the officer who takes over this officer's spot, or -1. */
  relief: Int32Array;
  police: number;
}

const rosters = new WeakMap<PersonPool, Roster>();

function buildRoster(pool: PersonPool): Roster {
  const length = pool.id.length;
  const roster: Roster = {
    length,
    nextId: pool.nextId,
    offices: new Map(),
    shift: new Uint8Array(length),
    spot: new Uint8Array(length),
    relief: new Int32Array(length).fill(-1),
    police: 0,
  };
  for (let slot = 0; slot < length; slot++) {
    if (!isPolice(pool, slot)) continue;
    const office = pool.homeUnit[slot] as number;
    let list = roster.offices.get(office);
    if (!list) {
      list = [];
      roster.offices.set(office, list);
    }
    list.push(slot);
    roster.police += 1;
  }
  for (const list of roster.offices.values()) {
    list.forEach((slot, index) => {
      const shift = Math.floor(index / SECURITY_SPOTS) % SECURITY_SHIFTS;
      const spot = index % SECURITY_SPOTS;
      roster.shift[slot] = shift;
      roster.spot[slot] = spot;
      const next = ((shift + 1) % SECURITY_SHIFTS) * SECURITY_SPOTS + spot;
      roster.relief[slot] = next < list.length ? (list[next] as number) : -1;
    });
  }
  return roster;
}

function rosterOf(pool: PersonPool): Roster {
  const known = rosters.get(pool);
  if (known && known.length === pool.id.length && known.nextId === pool.nextId) return known;
  const fresh = buildRoster(pool);
  rosters.set(pool, fresh);
  return fresh;
}

/** The slots of the officers of one office in roster order. */
export function policeRosterOf(pool: PersonPool, officeNumber: number): readonly number[] {
  return rosterOf(pool).offices.get(officeNumber) ?? [];
}

/** Where an officer's spot is inside the office, so the seven do not stand on one cell. */
export function policeBasePlace(pool: PersonPool, slot: number, office: Unit): Place {
  const spot = rosterOf(pool).spot[slot] as number;
  const width = UNIT_CATALOG[office.type].width;
  return { level: office.level, column: office.x + Math.min(width - 1, 1 + 2 * spot) };
}

function isInOffice(pool: PersonPool, slot: number, office: Unit): boolean {
  const column = pool.column[slot] as number;
  return (
    pool.level[slot] === office.level &&
    column >= office.x &&
    column < office.x + UNIT_CATALOG[office.type].width
  );
}

function mix(a: number, b: number, c: number): number {
  let hash = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 15) ^ Math.imul(c, 0x27d4eb2f), 0x2c1b3c6d);
  hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
  return (hash ^ (hash >>> 15)) >>> 0;
}

function setPhase(
  pool: PersonPool,
  slot: number,
  phase: PolicePhase,
  dueStep: number = NOTHING_DUE,
): void {
  const previous = decodePoliceRoutine(pool.trip[slot] ?? NO_TRIP);
  const routine: PoliceRoutine = { phase, entranceOnRight: previous?.entranceOnRight ?? false };
  pool.trip[slot] = encodePoliceRoutine(routine);
  pool.dueStep[slot] = dueStep;
}

interface Officer {
  context: StepContext;
  slot: number;
  office: Unit;
  shift: number;
  spot: number;
  roster: Roster;
  phase: PolicePhase;
}

function officeOf(state: TowerState, slot: number): Unit | null {
  const unit = state.units[`u${state.people.homeUnit[slot]}`];
  return unit?.type === 'security' ? unit : null;
}

/** True when this officer's shift is over and the next one is the shift on now. */
function isOutgoing(officer: Officer): boolean {
  return officer.shift === (currentShiftOf(officer.context.state.step) + SECURITY_SHIFTS - 1) % SECURITY_SHIFTS;
}

/** Steps since the officer's shift ended, 0 for an officer whose shift is not over. */
function stepsSinceShiftEnd(officer: Officer): number {
  const end = (officer.shift + 1) * SHIFT_STEPS;
  return (((officer.context.state.step % STEPS_PER_DAY) - end) % STEPS_PER_DAY + STEPS_PER_DAY) % STEPS_PER_DAY;
}

/** The officer comes in once the shift is within its arrival lead time or on. */
function isArrivalTime(officer: Officer): boolean {
  const ahead = (officer.context.state.step + LEAD_STEPS) % STEPS_PER_DAY;
  return Math.floor(ahead / SHIFT_STEPS) % SECURITY_SHIFTS === officer.shift;
}

function startArrival(officer: Officer): void {
  const { context, slot, office } = officer;
  const { state } = context;
  const pool = state.people;
  const day = Math.floor(state.step / STEPS_PER_DAY);
  const onRight = (mix(pool.id[slot] as number, day, 7) & 1) === 1;
  const street = streetPlace(onRight);
  pool.level[slot] = street.level;
  pool.column[slot] = street.column;
  pool.trip[slot] = encodePoliceRoutine({ phase: 'arriving', entranceOnRight: onRight });
  pool.dueStep[slot] = NOTHING_DUE;
  if (startTrek(context, slot, policeBasePlace(pool, slot, office))) return;
  // No way in from the street: try again later.
  setPhase(pool, slot, 'off', state.step + ROUTE_RETRY_STEPS);
}

function startLeaving(officer: Officer): void {
  const { context, slot } = officer;
  const { state } = context;
  const pool = state.people;
  const near = nearestStreetColumn(pool.column[slot] as number) !== 0;
  setPhase(pool, slot, 'leaving');
  for (const onRight of [near, !near]) {
    const exit = entrancePlace(state, onRight);
    if (exit && startTrek(context, slot, exit, streetColumn(onRight))) return;
  }
  // No way out of the tower: the officer goes off where they stand.
  setPhase(pool, slot, 'off');
}

function isRelieved(officer: Officer): boolean {
  const relief = officer.roster.relief[officer.slot] as number;
  if (relief < 0) return true;
  return isPhaseOnDuty(policePhaseAt(officer.context.state.people, relief));
}

/** An officer waiting at the base for the shift to be taken over, who goes home once relieved. */
function maybeGoHome(officer: Officer): void {
  const { context, slot } = officer;
  if (!isRelieved(officer) && stepsSinceShiftEnd(officer) < GRACE_STEPS) return;
  setPhase(context.state.people, slot, 'changingOut', context.state.step + CHANGE_CLOTHES_STEPS);
}

function returnToBase(officer: Officer): void {
  const { context, slot, office } = officer;
  const pool = context.state.people;
  if (isOnTrek(pool, slot)) cancelTrek(context, slot);
  const base = policeBasePlace(pool, slot, office);
  setPhase(pool, slot, 'returning');
  if (pool.level[slot] === base.level && pool.column[slot] === base.column) {
    setPhase(pool, slot, 'working');
    return;
  }
  if (!startTrek(context, slot, base)) {
    // Nowhere to walk back to: the officer waits where they stand and tries again.
    setPhase(pool, slot, 'returning', context.state.step + ROUTE_RETRY_STEPS);
  }
}

/** True when the person stands on a cell covered by a unit (a patrol stop is always open floor). */
function isInsideUnit(state: TowerState, pool: PersonPool, slot: number): boolean {
  const here = occupantAt(state.grid, pool.level[slot] as Level, pool.column[slot] as number);
  return here !== null && here.kind === 'unit';
}

function patrolWeight(unit: Unit, own: Unit): number {
  if (unit === own || unit.type === 'lobby' || unit.type === 'security') return 0;
  return SECURITY_PATROL_WEIGHTS[unit.type] ?? 1;
}

/** The unit picked from `roll` by weight, or null when no unit can be visited. */
function pickPatrolUnit(state: TowerState, own: Unit, roll: number): Unit | null {
  let total = 0;
  for (const id in state.units) total += patrolWeight(state.units[id as keyof typeof state.units] as Unit, own);
  if (total === 0) return null;
  let left = roll % total;
  for (const id in state.units) {
    const unit = state.units[id as keyof typeof state.units] as Unit;
    left -= patrolWeight(unit, own);
    if (left < 0) return unit;
  }
  return null;
}

/**
 * Open floor next to a unit: the nearest column on the unit's level that has floor or lobby and
 * nothing built on it. Patrols stop there and never walk into the unit.
 */
function hallwayPlace(state: TowerState, unit: Unit): Place | null {
  const width = UNIT_CATALOG[unit.type].width;
  for (let reach = 0; reach < HALLWAY_REACH; reach++) {
    for (const column of [unit.x - 1 - reach, unit.x + width + reach]) {
      if (column < 0 || column > LAST_COLUMN) continue;
      const structure = structureAt(state.grid, unit.level, column);
      if ((structure === 'floor' || structure === 'lobby') && occupantAt(state.grid, unit.level, column) === null) {
        return { level: unit.level, column };
      }
    }
  }
  return null;
}

/**
 * Picks the next patrol stop: a random unit, shops and food first, then the open floor beside it. Patrols keep off the elevators
 * (the trek plans them as stairs and escalators only), so a unit with no such route is skipped.
 * With nothing reachable the officer stays at the base and looks again later.
 */
function startPatrol(officer: Officer): void {
  const { context, slot, office } = officer;
  const { state } = context;
  const pool = state.people;
  const id = pool.id[slot] as number;
  setPhase(pool, slot, 'patrolling');
  for (let attempt = 0; attempt < PATROL_TRIES; attempt++) {
    const unit = pickPatrolUnit(state, office, mix(id, state.step, attempt));
    if (!unit) break;
    const stop = hallwayPlace(state, unit);
    if (stop !== null && startTrek(context, slot, stop)) return;
  }
  setPhase(pool, slot, 'working', state.step + PATROL_TRIES * 10 * STEPS_PER_MINUTE);
}

function advanceOfficer(officer: Officer): void {
  const { context, slot, office, phase } = officer;
  const { state } = context;
  const pool = state.people;
  switch (phase) {
    case 'off':
      if ((pool.dueStep[slot] as number) <= state.step && isArrivalTime(officer)) {
        startArrival(officer);
      }
      return;
    case 'arriving':
      if (isOnTrek(pool, slot)) return;
      if (isInOffice(pool, slot, office)) {
        setPhase(pool, slot, 'changingIn', state.step + CHANGE_CLOTHES_STEPS);
      } else if (!startTrek(context, slot, policeBasePlace(pool, slot, office))) {
        setPhase(pool, slot, 'off', state.step + ROUTE_RETRY_STEPS);
      }
      return;
    case 'changingIn':
      if (state.step >= (pool.dueStep[slot] as number)) setPhase(pool, slot, 'working');
      return;
    case 'working':
      if ((pool.dueStep[slot] as number) > state.step) return;
      if (isOutgoing(officer)) maybeGoHome(officer);
      else if (officer.shift === currentShiftOf(state.step) && spotKindOf(officer.spot) === 'patrol') {
        startPatrol(officer);
      }
      return;
    case 'patrolling':
      if (officer.shift !== currentShiftOf(state.step)) {
        returnToBase(officer);
      } else if (!isOnTrek(pool, slot)) {
        // The walk ended inside a unit (it was cut short): patrols only stop on open floor, so head back to the base.
        if (isInsideUnit(state, pool, slot)) {
          returnToBase(officer);
          return;
        }
        const stop = SECURITY_PATROL_STOP_MINUTES;
        const minutes = stop.min + (mix(pool.id[slot] as number, state.step, 99) % (stop.max - stop.min + 1));
        setPhase(pool, slot, 'lingering', state.step + minutes * STEPS_PER_MINUTE);
      }
      return;
    case 'lingering':
      if (officer.shift !== currentShiftOf(state.step) || isInsideUnit(state, pool, slot)) returnToBase(officer);
      else if (state.step >= (pool.dueStep[slot] as number)) startPatrol(officer);
      return;
    case 'returning':
      if (isOnTrek(pool, slot)) return;
      if ((pool.dueStep[slot] as number) > state.step) return;
      if (isInOffice(pool, slot, office)) setPhase(pool, slot, 'working');
      else returnToBase(officer);
      return;
    case 'summoned':
      // An event owns the officer until it sends them home; once back in the office they resume.
      if (!isOnTrek(pool, slot) && isInOffice(pool, slot, office)) setPhase(pool, slot, 'working');
      return;
    case 'changingOut':
      if (state.step >= (pool.dueStep[slot] as number)) startLeaving(officer);
      return;
    case 'leaving':
      if (!isOnTrek(pool, slot)) setPhase(pool, slot, 'off');
      return;
  }
}

/** Runs every officer one step, after the trek system has moved them. */
export function createPoliceSystem(): SimulationSystem {
  return (context) => {
    const pool = context.state.people;
    const roster = rosterOf(pool);
    if (roster.police === 0) return;
    for (let slot = 0; slot < pool.id.length; slot++) {
      if (!isPolice(pool, slot)) continue;
      const office = officeOf(context.state, slot);
      if (!office) continue;
      advanceOfficer({
        context,
        slot,
        office,
        shift: roster.shift[slot] as number,
        spot: roster.spot[slot] as number,
        roster,
        phase: policePhaseAt(pool, slot),
      });
    }
  };
}

/**
 * Puts the first `limit` officers of the shift on now in their base places, in uniform and on
 * duty (tests and tools). The rest of that shift stay off for a day instead of walking in.
 */
export function seatShiftOnDuty(state: TowerState, limit = SECURITY_SPOTS): void {
  const pool = state.people;
  const roster = rosterOf(pool);
  const shift = currentShiftOf(state.step);
  for (const [officeNumber, list] of roster.offices) {
    const office = state.units[`u${officeNumber}`];
    if (!office) continue;
    for (const slot of list) {
      if (roster.shift[slot] !== shift) continue;
      if ((roster.spot[slot] as number) >= limit) {
        setPhase(pool, slot, 'off', state.step + STEPS_PER_DAY);
        continue;
      }
      const base = policeBasePlace(pool, slot, office);
      pool.level[slot] = base.level;
      pool.column[slot] = base.column;
      setPhase(pool, slot, 'working');
    }
  }
}

/** Adds the officers an office lacks, off duty, so every office has its three shifts. */
function topUpOffice(state: TowerState, office: Unit): void {
  const people = unitPeople(office.type);
  if (!people || people.kind !== 'police') return;
  const homeUnit = unitNumber(office.id);
  const have = policeRosterOf(state.people, homeUnit).length;
  for (let index = have; index < people.count; index++) {
    const slot = state.people.id.length;
    addPerson(state, { kind: 'police', homeUnit, level: office.level, column: office.x });
    state.people.trip[slot] = encodePoliceRoutine({ phase: 'off', entranceOnRight: false });
  }
}

/** At 00:00 every security office is brought up to its full roster (this covers old saves). */
export const policeRosterHook: ScheduledHook = {
  name: 'police-roster',
  schedule: { every: 'day', hour: 0, minute: 0 },
  run({ state }) {
    for (const id in state.units) {
      const unit = state.units[id as keyof typeof state.units] as Unit;
      if (unit.type === 'security') topUpOffice(state, unit);
    }
  },
};
