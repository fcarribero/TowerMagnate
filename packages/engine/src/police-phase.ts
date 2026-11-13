import { PERSON_KINDS, type PersonPool } from '@tower-magnate/shared';

/**
 * What a police officer is doing. `off` is outside the tower between shifts; the officer stays in
 * the pool so the id is stable. Civilian clothes are worn in `arriving`, `changingIn` and
 * `leaving`; every other phase is in uniform.
 */
export const POLICE_PHASES = [
  'off',
  'arriving',
  'changingIn',
  'working',
  'patrolling',
  'lingering',
  'returning',
  'changingOut',
  'leaving',
  'summoned',
] as const;

export type PolicePhase = (typeof POLICE_PHASES)[number];

export const POLICE_KIND = PERSON_KINDS.indexOf('police');

const PHASE_RANGE = 16;

export interface PoliceRoutine {
  phase: PolicePhase;
  /** The lobby end the officer came in by, tried first on the way out. */
  entranceOnRight: boolean;
}

/** Packs the routine into a positive integer; a routine always has a phase, so it is never 0. */
export function encodePoliceRoutine(routine: PoliceRoutine): number {
  return (routine.entranceOnRight ? PHASE_RANGE : 0) + POLICE_PHASES.indexOf(routine.phase) + 1;
}

export function decodePoliceRoutine(trip: number): PoliceRoutine | null {
  if (trip <= 0) return null;
  const phase = POLICE_PHASES[(trip - 1) % PHASE_RANGE];
  if (!phase) return null;
  return { phase, entranceOnRight: trip > PHASE_RANGE };
}

export function isPolice(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === POLICE_KIND;
}

/** The phase of the officer in this slot; an officer with no routine (old saves) is `off`. */
export function policePhaseAt(pool: PersonPool, slot: number): PolicePhase {
  return decodePoliceRoutine(pool.trip[slot] ?? 0)?.phase ?? 'off';
}

/** In the tower, in uniform and ready: the officers events may send and a relief waits for. */
export function isPhaseOnDuty(phase: PolicePhase): boolean {
  return (
    phase === 'working' ||
    phase === 'patrolling' ||
    phase === 'lingering' ||
    phase === 'returning' ||
    phase === 'summoned'
  );
}

export function isPoliceOnDuty(pool: PersonPool, slot: number): boolean {
  return isPolice(pool, slot) && isPhaseOnDuty(policePhaseAt(pool, slot));
}

export function isPhaseUniform(phase: PolicePhase): boolean {
  return isPhaseOnDuty(phase) || phase === 'changingOut';
}

/**
 * True while the officer patrols or walks back from a patrol, the times police are kept off the
 * elevators. An officer an event sent somewhere is `summoned` and may ride them.
 */
export function isPatrolling(pool: PersonPool, slot: number): boolean {
  if (pool.kind[slot] !== POLICE_KIND) return false;
  const phase = policePhaseAt(pool, slot);
  return phase === 'patrolling' || phase === 'returning';
}
