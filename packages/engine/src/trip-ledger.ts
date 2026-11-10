import {
  PERSON_KINDS,
  STRESS_ESCALATOR_FLOOR,
  STRESS_NO_ROUTE,
  STRESS_QUEUE_FULL,
  STRESS_STAIR_FLOOR,
  STRESS_TRIP_CAP,
  STRESS_WINDOW_STEPS,
  type GridState,
  type HallDirection,
  type Level,
  type LobbyHeight,
  type PersonPool,
  type Shaft,
  type TowerState,
} from '@tower-magnate/shared';
import { lobbyRows } from './commands/build-lobby';
import { averageStress, type RecordedTrip } from './person-stress';
import { floorIndex } from './routing/transport-graph';
import type { ScheduledHook } from './scheduler';
import type { StepContext } from './step';
import { writableTripLedger } from './step-copy';
import { cappedStress, finishedTripStress, tallLobbyCut } from './trip-stress';
import { fileUnitTrip } from './unit-evaluation';

const MAID_KIND = PERSON_KINDS.indexOf('maid');
const GUARD_KIND = PERSON_KINDS.indexOf('guard');

function recordsStress(pool: PersonPool, slot: number): boolean {
  return pool.kind[slot] !== MAID_KIND && pool.kind[slot] !== GUARD_KIND;
}

function field(array: readonly number[], slot: number): number {
  return array[slot] ?? 0;
}

/** The trips a person ended in the last week, oldest first. */
export function tripsOf(state: TowerState, personId: number): RecordedTrip[] {
  const flat = state.tripLedger[String(personId)] ?? [];
  const trips: RecordedTrip[] = [];
  for (let at = 0; at < flat.length; at += 2) {
    trips.push({ endStep: field(flat, at), stress: field(flat, at + 1) });
  }
  return trips;
}

/** What the person is doing at the shaft, for the wait or ride under way. */
export type PartUnderWay = 'queued' | 'riding' | null;

function underWaySteps(state: TowerState, slot: number, part: PartUnderWay): number {
  const pool = state.people;
  const elapsed = state.step - field(pool.tripPartStep, slot);
  if (part === 'riding') return elapsed;
  if (part === 'queued') return Math.max(0, elapsed - field(pool.tripPartCut, slot));
  return 0;
}

interface LedgerWindow {
  sum: number;
  count: number;
  /** First step after the current one at which a trip enters or leaves the window. */
  nextChange: number;
}

function ledgerWindow(state: TowerState, slot: number): LedgerWindow {
  // A number key finds the same entry as its string without building the string.
  const flat = state.tripLedger[field(state.people.id, slot)] ?? [];
  const oldest = state.step - STRESS_WINDOW_STEPS;
  let sum = 0;
  let count = 0;
  let nextChange = Infinity;
  for (let at = 0; at < flat.length; at += 2) {
    const endStep = field(flat, at);
    if (endStep > state.step) {
      nextChange = Math.min(nextChange, endStep);
      continue;
    }
    if (endStep < oldest) continue;
    sum += field(flat, at + 1);
    count += 1;
    nextChange = Math.min(nextChange, endStep + STRESS_WINDOW_STEPS + 1);
  }
  return { sum, count, nextChange };
}

/**
 * First step at which the stress so far of the part under way pushes the average up by one, or
 * Infinity when it can't before the trip cap.
 */
function nextStressRise(
  state: TowerState,
  slot: number,
  part: PartUnderWay,
  window: LedgerWindow,
  stress: number,
): number {
  if (part === null) return Infinity;
  const pool = state.people;
  const neededSoFar = (stress + 1) * (window.count + 1) - window.sum;
  if (neededSoFar > STRESS_TRIP_CAP) return Infinity;
  const startsCounting =
    field(pool.tripPartStep, slot) + (part === 'queued' ? field(pool.tripPartCut, slot) : 0);
  return startsCounting + neededSoFar - field(pool.tripSum, slot);
}

/**
 * Sets the stored person stress P from the trips ended in the last week and, when the person is
 * on a trip, the stress so far of that trip including the wait or ride under way. Returns the
 * first later step at which P can change while the trip parts stay as they are.
 */
export function refreshPersonStress(
  state: TowerState,
  slot: number,
  onTrip: boolean,
  part: PartUnderWay = null,
): number {
  const pool = state.people;
  if (!recordsStress(pool, slot)) return Infinity;
  const soFar = field(pool.tripSum, slot) + underWaySteps(state, slot, part);
  const window = ledgerWindow(state, slot);
  const stress = averageStress(window.sum, window.count, onTrip ? cappedStress(soFar) : null);
  pool.stress[slot] = stress;
  const rise = onTrip ? nextStressRise(state, slot, part, window, stress) : Infinity;
  return Math.max(state.step + 1, Math.min(window.nextChange, rise));
}

/** A trip that ends mid-wait or mid-ride keeps the part under way. */
export function settlePartUnderWay(state: TowerState, slot: number, part: PartUnderWay): void {
  const pool = state.people;
  pool.tripSum[slot] = field(pool.tripSum, slot) + underWaySteps(state, slot, part);
  pool.tripPartStep[slot] = 0;
}

function clearParts(pool: PersonPool, slot: number): void {
  pool.tripSum[slot] = 0;
  pool.tripSlowFloors[slot] = 0;
  pool.tripPartStep[slot] = 0;
  pool.tripPartCut[slot] = 0;
}

function stillInWindow(state: TowerState, flat: readonly number[]): number[] {
  const oldest = state.step - STRESS_WINDOW_STEPS;
  const kept: number[] = [];
  for (let at = 0; at < flat.length; at += 2) {
    if (field(flat, at) >= oldest) kept.push(field(flat, at), field(flat, at + 1));
  }
  return kept;
}

/**
 * Files the trip the person is on, or has pending after failed searches, into their ledger at
 * the current step. Maids and guards record nothing. The trip parts start again from zero.
 */
export function recordTrip(
  state: TowerState,
  slot: number,
  options: { nightReset?: boolean } = {},
): void {
  const pool = state.people;
  if (!recordsStress(pool, slot)) {
    clearParts(pool, slot);
    return;
  }
  const failedAttempt = options.nightReset ? STRESS_NO_ROUTE : 0;
  const sum = field(pool.tripSum, slot) + failedAttempt;
  const stress = finishedTripStress(sum, field(pool.tripSlowFloors, slot));
  const key = String(field(pool.id, slot));
  writableTripLedger(state)[key] = [
    ...stillInWindow(state, state.tripLedger[key] ?? []),
    state.step,
    stress,
  ];
  const home = state.units[`u${field(pool.homeUnit, slot)}`];
  if (home && home.type !== 'retail-shop') fileUnitTrip(state, home, state.step, stress);
  clearParts(pool, slot);
  refreshPersonStress(state, slot, false);
}

/** Trip stress of the person's trip that ended at the current step, or null if none did. */
export function stressOfTripEndedNow(state: TowerState, slot: number): number | null {
  const flat = state.tripLedger[String(field(state.people.id, slot))] ?? [];
  if (flat.length < 2 || flat[flat.length - 2] !== state.step) return null;
  return field(flat, flat.length - 1);
}

/** True when the person has stress parts that no recorded trip holds yet. */
export function hasPendingTrip(pool: PersonPool, slot: number): boolean {
  return field(pool.tripSum, slot) > 0 || field(pool.tripSlowFloors, slot) > 0;
}

export function addFailedSearch(pool: PersonPool, slot: number): void {
  pool.tripSum[slot] = field(pool.tripSum, slot) + STRESS_NO_ROUTE;
}

export function addFullQueueEvent(pool: PersonPool, slot: number): void {
  pool.tripSum[slot] = field(pool.tripSum, slot) + STRESS_QUEUE_FULL;
}

export function addFlight(pool: PersonPool, slot: number, kind: 'stairs' | 'escalator'): void {
  const stairs = kind === 'stairs';
  const stress = stairs ? STRESS_STAIR_FLOOR : STRESS_ESCALATOR_FLOOR;
  pool.tripSum[slot] = field(pool.tripSum, slot) + stress;
  if (stairs) pool.tripSlowFloors[slot] = field(pool.tripSlowFloors, slot) + 1;
}

function lobbyBases(grid: GridState): [Level, LobbyHeight][] {
  const bases: [Level, LobbyHeight][] = [];
  if (grid.mainLobbyHeight) bases.push([1, grid.mainLobbyHeight]);
  for (const [base, height] of Object.entries(grid.skyLobbyHeights)) {
    if (height) bases.push([Number(base) as Level, height]);
  }
  return bases;
}

/** Height of the lobby that has a lobby cell at this level and column, or null. */
export function lobbyHeightAt(grid: GridState, level: Level, column: number): number | null {
  const onLobbyCell = grid.levels[level]?.structure.some(
    (span) => span.kind === 'lobby' && span.x0 <= column && column <= span.x1,
  );
  if (!onLobbyCell) return null;
  const lobby = lobbyBases(grid).find(([base, height]) => lobbyRows(base, height).includes(level));
  return lobby ? lobby[1] : null;
}

/**
 * A person joins a queue: the wait starts, and a tall lobby cuts it when the ride goes up.
 * `lobbyHeight` is `lobbyHeightAt` the person's level and the shaft's column.
 */
export function startWait(
  state: TowerState,
  slot: number,
  direction: HallDirection,
  lobbyHeight: number | null,
): void {
  const pool = state.people;
  pool.tripPartStep[slot] = state.step;
  pool.tripPartCut[slot] = tallLobbyCut(direction, lobbyHeight);
}

/** The person steps into a car: the counted wait is final and the ride starts. */
export function boardCar(state: TowerState, slot: number): void {
  const pool = state.people;
  const wait = state.step - field(pool.tripPartStep, slot);
  const counted = Math.max(0, wait - field(pool.tripPartCut, slot));
  pool.tripSum[slot] = field(pool.tripSum, slot) + counted;
  pool.tripPartStep[slot] = state.step;
  pool.tripPartCut[slot] = 0;
}

/** The person leaves the car at `to`; their level is still the one they boarded on. */
export function finishRide(
  state: TowerState,
  slot: number,
  shaft: Shaft | undefined,
  to: Level,
): void {
  const pool = state.people;
  const rideSteps = state.step - field(pool.tripPartStep, slot);
  pool.tripSum[slot] = field(pool.tripSum, slot) + rideSteps;
  if (shaft && shaft.type !== 'express') {
    const from = field(pool.level, slot) as Level;
    const floors = Math.abs(floorIndex(to) - floorIndex(from));
    pool.tripSlowFloors[slot] = field(pool.tripSlowFloors, slot) + floors;
  }
  pool.tripPartStep[slot] = 0;
}

/**
 * At 03:00 everyone still on a trip, or waiting to retry one, ends it with one more failed
 * attempt (people P-07). `endTrip` stops the walk of a person who is on a trek.
 */
export function createNightReset(
  endTrip: (context: StepContext, slot: number) => void,
  isOnTrip: (pool: PersonPool, slot: number) => boolean,
): ScheduledHook {
  return {
    name: 'trip-night-reset',
    schedule: { every: 'day', hour: 3, minute: 0 },
    run: (context) => {
      const { state } = context;
      const pool = state.people;
      for (let slot = 0; slot < pool.id.length; slot++) {
        if (isOnTrip(pool, slot)) endTrip(context, slot);
        else if (hasPendingTrip(pool, slot)) recordTrip(state, slot, { nightReset: true });
        else refreshPersonStress(state, slot, false);
      }
    },
  };
}
