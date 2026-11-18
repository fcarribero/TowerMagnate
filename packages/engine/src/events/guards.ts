import { UNIT_CATALOG, type GridState, type Level, type PersonPool } from '@tower-magnate/shared';
import { NO_TRIP, NOTHING_DUE } from '../people';
import { policeBasePlace } from '../police';
import { decodePoliceRoutine, encodePoliceRoutine, isPoliceOnDuty } from '../police-phase';
import type { StepContext } from '../step';
import { cancelTrek, isOnTrek, startTrek, type TrekPlace } from '../trek';

/** Marks the officer as taken over by an event, so the shift routine leaves them alone. */
function summon(pool: PersonPool, slot: number): void {
  const routine = decodePoliceRoutine(pool.trip[slot] ?? NO_TRIP);
  pool.trip[slot] = encodePoliceRoutine({
    phase: 'summoned',
    entranceOnRight: routine?.entranceOnRight ?? false,
  });
  pool.dueStep[slot] = NOTHING_DUE;
}

/** Removes a person's entry from a record keyed by person number. */
export function forget(record: Record<number, unknown>, person: number): void {
  Reflect.deleteProperty(record, person);
}

/** Slots of the police on duty in the tower (in uniform, inside it), in increasing person id. */
export function guardSlots(pool: PersonPool): number[] {
  const slots: number[] = [];
  for (let slot = 0; slot < pool.kind.length; slot++) {
    if (isPoliceOnDuty(pool, slot)) slots.push(slot);
  }
  return slots;
}

/** Sends the guard to `to`, dropping whatever trip it was on. False when there is no route. */
export function sendGuard(context: StepContext, slot: number, to: TrekPlace): boolean {
  cancelTrek(context, slot);
  summon(context.state.people, slot);
  return startTrek(context, slot, to);
}

/** True when the guard has stopped travelling and stands on `level`. */
export function isStandingOn(pool: PersonPool, slot: number, level: Level): boolean {
  return !isOnTrek(pool, slot) && pool.level[slot] === level;
}

/** Sends the guard back to its office unless it is already there and still. */
export function sendGuardHome(context: StepContext, slot: number): void {
  const { state } = context;
  const pool = state.people;
  const office = state.units[`u${pool.homeUnit[slot]}`];
  if (!office) return;
  const column = pool.column[slot] as number;
  const inOffice =
    pool.level[slot] === office.level &&
    column >= office.x &&
    column < office.x + UNIT_CATALOG[office.type].width;
  if (inOffice && !isOnTrek(pool, slot)) return;
  sendGuard(context, slot, policeBasePlace(pool, slot, office));
}

export function sendGuardsHome(context: StepContext): void {
  for (const slot of guardSlots(context.state.people)) sendGuardHome(context, slot);
}

/** Columns with structure on a level, and the leftmost of them (null when there are none). */
export function structureOfLevel(
  grid: GridState,
  level: Level,
): { columns: number; leftmost: number | null } {
  const spans = grid.levels[level]?.structure ?? [];
  let columns = 0;
  for (const span of spans) columns += span.x1 - span.x0 + 1;
  return { columns, leftmost: spans[0]?.x0 ?? null };
}
