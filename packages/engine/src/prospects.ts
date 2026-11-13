import {
  PERSON_KINDS,
  PROSPECT_CHANCE,
  PROSPECT_ROLL_HOURS,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { isWeekendDay } from './calendar';
import { sellCondo } from './condos';
import { isLeasable, moveInTenant } from './leases';
import { entrancePlace, unitPlace } from './office-routine';
import {
  addPeopleForUnit,
  rollParkingHolder,
  addPerson,
  createPeopleSystem,
  NOTHING_DUE,
  removePerson,
  slotOfPerson,
  unitPeople,
} from './people';
import { chance } from './rng';
import type { HookOccurrence, ScheduledHook } from './scheduler';
import type { SimulationSystem, StepContext } from './step';
import { isOnTrek, startTrek } from './trek';
import { unitNumber } from './units';

const PROSPECT_KIND = PERSON_KINDS.indexOf('prospect');
const RESIDENT_KIND = PERSON_KINDS.indexOf('resident');
const CONDO_HOUSEHOLD = unitPeople('condo')?.count ?? 1;

function isVacant(unit: Unit): boolean {
  if (unit.type === 'condo') return !unit.sale;
  return isLeasable(unit) && !unit.lease;
}

function rollsToday(unit: Unit, occurrence: HookOccurrence): boolean {
  return unit.type !== 'office' || !isWeekendDay(occurrence.weekday);
}

/**
 * Drops prospects that stopped walking before they arrived (a stair or shaft they needed is gone),
 * so their unit can roll again, and returns the units that still have a prospect on the way.
 */
function unitsWithProspects(state: TowerState): Set<number> {
  const pool = state.people;
  const onTheWay = new Set<number>();
  const stranded: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.kind[slot] !== PROSPECT_KIND) continue;
    if (isOnTrek(pool, slot)) onTheWay.add(pool.homeUnit[slot] as number);
    else stranded.push(pool.id[slot] as number);
  }
  for (const personId of stranded) removePerson(state, personId);
  return onTheWay;
}

function sendProspect(context: StepContext, unit: Unit): void {
  const { state } = context;
  const onRight = chance(state.rng, 0.5);
  const entrance = entrancePlace(state, onRight);
  if (!entrance) return;
  const household = unit.type === 'condo' ? (unitPeople('condo')?.count ?? 1) : 1;
  const arrived: number[] = [];
  for (let index = 0; index < household; index++) {
    const personId = addPerson(state, {
      kind: 'prospect',
      homeUnit: unitNumber(unit.id),
      level: entrance.level,
      column: entrance.column,
    });
    arrived.push(personId);
    const slot = slotOfPerson(state.people, personId);
    if (!startTrek(context, slot, unitPlace(unit))) {
      for (const id of arrived) removePerson(state, id);
      return;
    }
  }
}

/** One hourly roll: every vacant unit without a prospect rolls once, in increasing unit id. */
function rollForProspects(context: StepContext, occurrence: HookOccurrence): void {
  const { state } = context;
  const waiting = unitsWithProspects(state);
  const vacant = Object.values(state.units)
    .filter((unit) => isVacant(unit) && rollsToday(unit, occurrence))
    .filter((unit) => !waiting.has(unitNumber(unit.id)))
    .sort((a, b) => unitNumber(a.id) - unitNumber(b.id));
  for (const unit of vacant) {
    const odds = PROSPECT_CHANCE[unit.priceLevel];
    if (chance(state.rng, odds)) sendProspect(context, unit);
  }
}

/** Residents of a condo, counting the prospects of its household who are still walking in. */
function householdOf(state: TowerState, unit: Unit): number {
  const pool = state.people;
  const home = unitNumber(unit.id);
  let count = 0;
  for (let slot = 0; slot < pool.id.length; slot++) {
    const kind = pool.kind[slot];
    if (pool.homeUnit[slot] === home && (kind === RESIDENT_KIND || kind === PROSPECT_KIND)) {
      count += 1;
    }
  }
  return count;
}

function settleProspect(context: StepContext, slot: number): void {
  const { state } = context;
  const pool = state.people;
  const personId = pool.id[slot] as number;
  const unitId = `u${pool.homeUnit[slot]}`;
  const unit = Object.hasOwn(state.units, unitId) ? state.units[unitId] : undefined;
  if (unit?.type === 'condo' && !isVacant(unit) && householdOf(state, unit) <= CONDO_HOUSEHOLD) {
    // The rest of the household walks in with the buyer and moves in as each one arrives.
    pool.kind[slot] = RESIDENT_KIND;
    pool.dueStep[slot] = NOTHING_DUE;
    return;
  }
  if (!unit || !isVacant(unit)) {
    removePerson(state, personId);
    return;
  }
  if (unit.type === 'condo') {
    sellCondo(context, unit.id);
    rollParkingHolder(state, personId, 'condo');
    pool.kind[slot] = RESIDENT_KIND;
    pool.dueStep[slot] = NOTHING_DUE;
    return;
  }
  moveInTenant(context, unit.id);
  removePerson(state, personId);
  if (unit.type === 'office') addPeopleForUnit(state, unit.id);
}

/** People spec 4.1: at 03:00 every prospect still on the way leaves the simulation. */
function sendProspectsHome(context: StepContext): void {
  const pool = context.state.people;
  const leaving: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (pool.kind[slot] === PROSPECT_KIND) leaving.push(pool.id[slot] as number);
  }
  for (const personId of leaving) removePerson(context.state, personId);
}

export interface ProspectDemand {
  rollHooks: ScheduledHook[];
  system: SimulationSystem;
}

/** Hourly prospect rolls from 08:00 to 18:00 and the system that moves tenants in on arrival. */
export function createProspectDemand(): ProspectDemand {
  const rollHooks: ScheduledHook[] = [];
  for (let hour = PROSPECT_ROLL_HOURS.first; hour <= PROSPECT_ROLL_HOURS.last; hour++) {
    rollHooks.push({
      name: `prospect-rolls-${hour}`,
      schedule: { every: 'day', hour, minute: 0 },
      run: rollForProspects,
    });
  }
  const system = createPeopleSystem((context, slot) => {
    if (context.state.people.kind[slot] === PROSPECT_KIND) settleProspect(context, slot);
  });
  rollHooks.push({
    name: 'prospect-night-leave',
    schedule: { every: 'day', hour: 3, minute: 0 },
    run: sendProspectsHome,
  });
  return { rollHooks, system };
}
