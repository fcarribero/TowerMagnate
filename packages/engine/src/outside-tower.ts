import { PERSON_KINDS, type PersonPool } from '@tower-magnate/shared';
import { guestRoutineAt } from './hotel-guest-trip';
import { routineAt } from './office-routine';
import { decodeResidentRoutine } from './resident-routine';
import { isOnTrek } from './trek';
import { NO_TRIP } from './people';

const OFFICE_WORKER_KIND = PERSON_KINDS.indexOf('officeWorker');
const RESIDENT_KIND = PERSON_KINDS.indexOf('resident');

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

/**
 * True for someone who has a plan for today but is not in the tower yet, or has gone out.
 * The pool still holds the place they last stood, usually a lobby end, so they must not be drawn.
 */
export function isOutsideTower(pool: PersonPool, slot: number): boolean {
  if (isOnTrek(pool, slot)) return false;
  const kind = pool.kind[slot];
  if (kind === OFFICE_WORKER_KIND) return officeWorkerIsOutside(pool, slot);
  if (kind === RESIDENT_KIND) return residentIsOutside(pool, slot);
  return guestRoutineAt(pool, slot)?.phase === 'outside';
}
