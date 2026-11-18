import {
  DOCTOR_ARRIVAL_LEAD_MINUTES,
  DOCTOR_CHANGE_MINUTES,
  DOCTOR_DAY_SHIFT_HOUR,
  DOCTOR_RELIEF_GRACE_MINUTES,
  DOCTOR_SHIFT_HOURS,
  DOCTOR_SHIFTS,
  DOCTORS_PER_SHIFT,
  PERSON_KINDS,
  ROUTE_RETRY_STEPS,
  type PersonPool,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR, STEPS_PER_MINUTE } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { entrancePlace, type Place } from './office-routine';
import { addPerson, NOTHING_DUE, personEntityId, removePerson } from './people';
import type { SimulationSystem, StepContext } from './step';
import { nearestStreetColumn, streetColumn, streetPlace } from './street';
import { isOnTrek, startTrek } from './trek';
import { unitNumber } from './units';

const DOCTOR_KIND = PERSON_KINDS.indexOf('doctor');
const SHIFT_STEPS = DOCTOR_SHIFT_HOURS * STEPS_PER_HOUR;
const DAY_SHIFT_START_STEP = DOCTOR_DAY_SHIFT_HOUR * STEPS_PER_HOUR;
const LEAD_STEPS = DOCTOR_ARRIVAL_LEAD_MINUTES * STEPS_PER_MINUTE;
const GRACE_STEPS = DOCTOR_RELIEF_GRACE_MINUTES * STEPS_PER_MINUTE;
const CHANGE_STEPS = DOCTOR_CHANGE_MINUTES * STEPS_PER_MINUTE;
/** Columns between the spots of the four doctors on duty, so they do not stand on one cell. */
const SPOT_GAP = 6;

/**
 * What a doctor is doing (service-units 2.8). A doctor walks in from the street in everyday clothes
 * (`arriving`), changes in the medical center (`changingIn`), works at a spot inside it
 * (`working`), and once the shift is over and the doctor of the same spot on the next shift is at
 * work, changes again (`changingOut`) and walks out (`leaving`). Doctors exist only while in the
 * tower: each shift brings new ones and the ones who leave are removed at the street.
 */
export type DoctorPhase = 'arriving' | 'changingIn' | 'working' | 'changingOut' | 'leaving';

const PHASES: readonly DoctorPhase[] = [
  'arriving',
  'changingIn',
  'working',
  'changingOut',
  'leaving',
];

export interface DoctorTask {
  phase: DoctorPhase;
  /** 0 for the day shift, 1 for the night shift. */
  shift: number;
  /** Position within the shift, 0 to 3: where the doctor stands and whose relief they are. */
  spot: number;
}

/** Packs the task into the person's `trip` number; never 0, which means no task. */
export function encodeDoctorTask(task: DoctorTask): number {
  return (
    1 + PHASES.indexOf(task.phase) + PHASES.length * (task.spot + DOCTORS_PER_SHIFT * task.shift)
  );
}

export function decodeDoctorTask(trip: number): DoctorTask | null {
  if (trip <= 0) return null;
  const code = trip - 1;
  const phase = PHASES[code % PHASES.length];
  const rest = Math.floor(code / PHASES.length);
  const shift = Math.floor(rest / DOCTORS_PER_SHIFT);
  if (!phase || shift >= DOCTOR_SHIFTS) return null;
  return { phase, shift, spot: rest % DOCTORS_PER_SHIFT };
}

export function isDoctor(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] === DOCTOR_KIND;
}

/** Doctors wear the white coat while at work and while changing out of it. */
export function doctorWearsUniform(pool: PersonPool, slot: number): boolean {
  const phase = decodeDoctorTask(pool.trip[slot] ?? 0)?.phase;
  return phase === 'working' || phase === 'changingOut';
}

/** The shift on at `step`: 0 from 08:00 to 20:00, 1 from 20:00 to 08:00. */
export function doctorShiftAt(step: number): number {
  const sinceDayShift =
    (((step - DAY_SHIFT_START_STEP) % STEPS_PER_DAY) + STEPS_PER_DAY) % STEPS_PER_DAY;
  return Math.floor(sinceDayShift / SHIFT_STEPS) % DOCTOR_SHIFTS;
}

/** Steps since the shift ended, counted around the clock. */
function stepsSinceShiftEnd(step: number, shift: number): number {
  const end = DAY_SHIFT_START_STEP + (shift + 1) * SHIFT_STEPS;
  return (((step - end) % STEPS_PER_DAY) + STEPS_PER_DAY) % STEPS_PER_DAY;
}

/**
 * True once the doctor's shift is over. A doctor who came in early, before the shift starts, is
 * not off shift: the hour before the start is excluded.
 */
function isShiftOver(step: number, shift: number): boolean {
  if (doctorShiftAt(step) === shift) return false;
  return stepsSinceShiftEnd(step, shift) < SHIFT_STEPS * (DOCTOR_SHIFTS - 1) - LEAD_STEPS;
}

/** Where a doctor's spot is inside the medical center. */
export function doctorSpotPlace(center: Unit, spot: number): Place {
  return { level: center.level, column: center.x + 2 + spot * SPOT_GAP };
}

function save(pool: PersonPool, slot: number, task: DoctorTask, dueStep = NOTHING_DUE): void {
  pool.trip[slot] = encodeDoctorTask(task);
  pool.dueStep[slot] = dueStep;
}

function isAt(pool: PersonPool, slot: number, place: Place): boolean {
  return pool.level[slot] === place.level && pool.column[slot] === place.column;
}

function medicalCenters(state: TowerState): Unit[] {
  return Object.values(state.units).filter((unit) => unit.type === 'medical-center');
}

/** The doctors in the tower for a medical center, by slot. */
export function doctorSlotsOf(pool: PersonPool, centerNumber: number): number[] {
  const slots: number[] = [];
  for (let slot = 0; slot < pool.id.length; slot++) {
    if (isDoctor(pool, slot) && pool.homeUnit[slot] === centerNumber) slots.push(slot);
  }
  return slots;
}

/** The person ids of the doctors at work in a medical center right now, for its window. */
export function doctorsAtWork(state: TowerState, center: Unit): string[] {
  const pool = state.people;
  return doctorSlotsOf(pool, unitNumber(center.id))
    .filter((slot) => decodeDoctorTask(pool.trip[slot] ?? 0)?.phase === 'working')
    .map((slot) => personEntityId(pool.id[slot] as number));
}

/** True when the doctor of this spot on the other shift is at work in the same center. */
function isRelieved(pool: PersonPool, centerNumber: number, task: DoctorTask): boolean {
  for (const slot of doctorSlotsOf(pool, centerNumber)) {
    const other = decodeDoctorTask(pool.trip[slot] ?? 0);
    if (
      other &&
      other.shift !== task.shift &&
      other.spot === task.spot &&
      other.phase === 'working'
    ) {
      return true;
    }
  }
  return false;
}

function walkIn(context: StepContext, slot: number, center: Unit, task: DoctorTask): void {
  const pool = context.state.people;
  save(pool, slot, { ...task, phase: 'arriving' });
  if (!startTrek(context, slot, doctorSpotPlace(center, task.spot))) {
    // No way in yet: try again later from where the doctor stands.
    pool.dueStep[slot] = context.state.step + ROUTE_RETRY_STEPS;
  }
}

/** Walks out through the nearer lobby end to the map edge; true when a route was found. */
function walkOut(context: StepContext, slot: number): boolean {
  const { state } = context;
  const near = nearestStreetColumn(state.people.column[slot] as number) !== 0;
  for (const onRight of [near, !near]) {
    const exit = entrancePlace(state, onRight);
    if (exit && startTrek(context, slot, exit, streetColumn(onRight))) return true;
  }
  return false;
}

/** Moves one doctor on; returns true when the doctor has left the tower and should be removed. */
function advance(context: StepContext, slot: number, center: Unit, task: DoctorTask): boolean {
  const { state } = context;
  const pool = state.people;
  const due = pool.dueStep[slot] as number;
  switch (task.phase) {
    case 'arriving': {
      if (isOnTrek(pool, slot)) return false;
      if (isAt(pool, slot, doctorSpotPlace(center, task.spot))) {
        save(pool, slot, { ...task, phase: 'changingIn' }, state.step + CHANGE_STEPS);
      } else if (due === NOTHING_DUE || due <= state.step) {
        walkIn(context, slot, center, task);
      }
      return false;
    }
    case 'changingIn':
      if (state.step >= due) save(pool, slot, { ...task, phase: 'working' });
      return false;
    case 'working': {
      if (!isShiftOver(state.step, task.shift)) return false;
      const late = stepsSinceShiftEnd(state.step, task.shift) >= GRACE_STEPS;
      if (late || isRelieved(pool, unitNumber(center.id), task)) {
        save(pool, slot, { ...task, phase: 'changingOut' }, state.step + CHANGE_STEPS);
      }
      return false;
    }
    case 'changingOut':
      if (state.step < due) return false;
      save(pool, slot, { ...task, phase: 'leaving' });
      // With no way out the doctor goes off where they stand.
      return !walkOut(context, slot);
    case 'leaving':
      return !isOnTrek(pool, slot);
  }
}

/**
 * Brings in the doctors a center lacks for the shift that is on or about to start: one per spot
 * that has no doctor of that shift on the way in or at work. This also staffs a center built in
 * the middle of a shift, and the centers of saves made before doctors existed.
 */
function staffCenters(context: StepContext): void {
  const { state } = context;
  const shift = doctorShiftAt(state.step + LEAD_STEPS);
  for (const center of medicalCenters(state)) {
    const centerNumber = unitNumber(center.id);
    const covered = new Set<number>();
    for (const slot of doctorSlotsOf(state.people, centerNumber)) {
      const task = decodeDoctorTask(state.people.trip[slot] ?? 0);
      if (
        task &&
        task.shift === shift &&
        task.phase !== 'changingOut' &&
        task.phase !== 'leaving'
      ) {
        covered.add(task.spot);
      }
    }
    for (let spot = 0; spot < DOCTORS_PER_SHIFT; spot++) {
      if (covered.has(spot)) continue;
      const onRight = (state.step + centerNumber + spot) % 2 === 1;
      const street = streetPlace(onRight);
      const slot = state.people.id.length;
      addPerson(state, {
        kind: 'doctor',
        homeUnit: centerNumber,
        level: street.level,
        column: street.column,
      });
      walkIn(context, slot, center, { phase: 'arriving', shift, spot });
    }
  }
}

/** Runs the doctors of every medical center; new ones are brought in once a minute. */
export function createDoctorSystem(): SimulationSystem {
  return (context) => {
    const { state } = context;
    const pool = state.people;
    const gone: number[] = [];
    for (let slot = 0; slot < pool.id.length; slot++) {
      if (!isDoctor(pool, slot)) continue;
      const center = state.units[`u${pool.homeUnit[slot]}`];
      const task = decodeDoctorTask(pool.trip[slot] ?? 0);
      if (!center || center.type !== 'medical-center' || !task) {
        gone.push(pool.id[slot] as number);
        continue;
      }
      if (advance(context, slot, center, task)) gone.push(pool.id[slot] as number);
    }
    for (const id of gone) removePerson(state, id);
    if (state.step % STEPS_PER_MINUTE === 0) staffCenters(context);
  };
}
