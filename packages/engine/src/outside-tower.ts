import { PERSON_KINDS, type PersonPool } from '@tower-magnate/shared';
import { guestRoutineAt } from './hotel-guest-trip';
import { routineAt } from './office-routine';
import { decodeResidentRoutine } from './resident-routine';
import { isOnTrek } from './trek';
import { NO_TRIP } from './people';
import { isStaffOutside } from './venue-staff';

const OFFICE_WORKER_KIND = PERSON_KINDS.indexOf('officeWorker');
const RESIDENT_KIND = PERSON_KINDS.indexOf('resident');
const STAFF_KIND = PERSON_KINDS.indexOf('staff');

/**
 * A worker is out of the tower before arriving, after giving up, and whenever they have no
 * plan: on weekends, after leaving for the day and from move-in until the next daily plan.
 */
function officeWorkerIsOutside(pool: PersonPool, slot: number): boolean {
  const phase = routineAt(pool, slot)?.phase;
  return phase === undefined || phase === 'waitingToArrive' || phase === 'givingUpArrival';
}

function residentIsOutside(pool: PersonPool, slot: number): boolean {
  return decodeResidentRoutine(pool.trip[slot] ?? NO_TRIP)?.phase === 'outside';
}

/** True for a resident or hotel guest who is in bed. */
export function isAsleep(pool: PersonPool, slot: number): boolean {
  const kind = pool.kind[slot];
  if (kind === RESIDENT_KIND) {
    return decodeResidentRoutine(pool.trip[slot] ?? NO_TRIP)?.phase === 'sleeping';
  }
  return guestRoutineAt(pool, slot)?.phase === 'sleeping';
}

/**
 * True for someone who has a plan for today but is not in the tower yet, or has gone out.
 * The pool still holds the place they last stood, usually a lobby end, so they must not be drawn.
 */
export function isOutsideTower(pool: PersonPool, slot: number): boolean {
  if (isOnTrek(pool, slot)) return false;
  const kind = pool.kind[slot];
  if (kind === OFFICE_WORKER_KIND) return officeWorkerIsOutside(pool, slot);
  if (kind === RESIDENT_KIND) return residentIsOutside(pool, slot);
  if (kind === STAFF_KIND) return isStaffOutside(pool, slot);
  return guestRoutineAt(pool, slot)?.phase === 'outside';
}
