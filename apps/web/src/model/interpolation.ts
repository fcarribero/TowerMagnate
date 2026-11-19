import {
  BASE_DELTA_INTERVAL_MS,
  deltaIntervalMs,
  levelToIndex,
  type CarView,
  type PersonView,
} from '@tower-magnate/shared';
import { gameSpeed } from '../render/animationClock';
import type { StoreFrames } from './clientStore';
import { carKey, type GameState } from './gameState';

/** Real time between two deltas from the server at normal speed. The client draws one delta behind. */
export const DELTA_INTERVAL_MS = BASE_DELTA_INTERVAL_MS;

/**
 * Buffered deltas further apart than this many steps, times the game speed, make cars snap
 * instead of glide.
 */
export const CAR_SNAP_GAP_STEPS = 6;

export interface DrawnCar {
  readonly key: string;
  readonly car: CarView;
  /** Dense level index as a float, between the two buffered positions. */
  readonly position: number;
}

export interface DrawnPerson {
  readonly person: PersonView;
  /** Column of the sprite's left edge. A rider takes the column of its shaft. */
  readonly x: number;
  /** Dense level index as a float. Only a rider is ever between two levels. */
  readonly position: number;
  /** Set while the person climbs a flight, or is walking off its top or bottom end. */
  readonly flight?: DrawnFlight;
}

/**
 * A person on a stair or escalator flight at the drawn moment. The flight is found from `level`
 * and `x`, where the person stood on it. `progress` runs from 0 at the entry to 1 at the exit. Once
 * `progress` is 1 the person has got off and `walked` is how far they have walked from the exit
 * to where the latest state has them, from 0 to 1.
 */
export interface DrawnFlight {
  readonly level: PersonView['level'];
  readonly x: number;
  readonly up: boolean;
  readonly progress: number;
  readonly walked: number;
}

export interface DrawnFrame {
  readonly cars: ReadonlyMap<string, DrawnCar>;
  readonly people: readonly DrawnPerson[];
  /** People inside their unit; they have no route, so the renderer moves them in the unit. */
  readonly inside?: readonly PersonView[];
  /** Real milliseconds one simulation step lasts, from the two buffered deltas. */
  readonly stepMs?: number;
}

/**
 * How far the drawing has moved from the previous delta to the latest one, from 0 to 1. Deltas
 * come more often at a higher game speed, so the drawing takes less time to catch up.
 */
export function progressSince(
  latestArrivedAtMs: number,
  nowMs: number,
  speed: number = gameSpeed(),
): number {
  const elapsed = nowMs - latestArrivedAtMs;
  return Math.min(Math.max(elapsed / deltaIntervalMs(speed), 0), 1);
}

/** The step the drawing shows, between the two buffered states. */
export function drawnStep(frames: StoreFrames, progress: number): number {
  const { previous, latest } = frames;
  if (previous === null) return latest.step;
  return Math.floor(previous.step + (latest.step - previous.step) * progress);
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function carsSnap(previous: GameState | null, latest: GameState, speed: number): boolean {
  return previous === null || latest.step - previous.step > CAR_SNAP_GAP_STEPS * Math.max(speed, 1);
}

function drawCars(frames: StoreFrames, progress: number, speed: number): Map<string, DrawnCar> {
  const { previous, latest } = frames;
  const snapAll = carsSnap(previous, latest, speed);
  const drawn = new Map<string, DrawnCar>();
  for (const [key, car] of latest.cars) {
    const before = snapAll ? undefined : previous?.cars.get(key);
    const position =
      before === undefined ? car.position : lerp(before.position, car.position, progress);
    drawn.set(key, { key, car, position });
  }
  return drawn;
}

function walkedOnSameLevel(before: PersonView, now: PersonView): boolean {
  return before.mode !== 'ride' && now.mode !== 'ride' && before.level === now.level;
}

function drawRider(
  person: PersonView,
  latest: GameState,
  cars: Map<string, DrawnCar>,
): DrawnPerson | null {
  if (person.carRef === null) {
    return null;
  }
  const car = cars.get(carKey(person.carRef));
  const shaft = latest.shafts.get(person.carRef.shaftId);
  if (car === undefined || shaft === undefined) {
    return null;
  }
  return { person, x: shaft.x, position: car.position };
}

/** The flight a person is on at the drawn moment, from the buffered states. Null off a flight. */
export function flightBetween(
  before: PersonView | undefined,
  person: PersonView,
  gap: number,
  progress: number,
): DrawnFlight | null {
  const past = before?.flight;
  if (before !== undefined && past !== undefined && before.level !== person.level) {
    // The flight ended during this delta: finish it, then walk to where the person is now.
    return landing(before, past, Math.max(gap, 1), progress);
  }
  const now = person.flight;
  if (now === undefined) return null;
  const sameFlight = past !== undefined && before !== undefined && before.level === person.level;
  const from = sameFlight ? past.done : Math.max(now.done - gap, 0);
  const done = from + (now.done - from) * progress;
  return { level: person.level, x: person.x, up: now.up, progress: done / now.steps, walked: 0 };
}

function landing(
  before: PersonView,
  past: NonNullable<PersonView['flight']>,
  gap: number,
  progress: number,
): DrawnFlight {
  const left = Math.max(past.steps - past.done, 0);
  const time = progress * gap;
  const base = { level: before.level, x: before.x, up: past.up };
  if (left >= gap) {
    // Less flight left than the delta covers: stretch it to end with the delta.
    const done = past.done + (left * time) / gap;
    return { ...base, progress: Math.min(done / past.steps, 1), walked: 0 };
  }
  if (time < left) {
    return { ...base, progress: (past.done + time) / past.steps, walked: 0 };
  }
  return { ...base, progress: 1, walked: Math.min((time - left) / (gap - left), 1) };
}

function drawWalker(
  person: PersonView,
  before: PersonView | undefined,
  progress: number,
  gap: number,
): DrawnPerson {
  const position = levelToIndex(person.level);
  const flight = flightBetween(before, person, gap, progress);
  if (flight !== null && person.mode !== 'ride') {
    return { person, x: person.x, position, flight };
  }
  if (before === undefined || !walkedOnSameLevel(before, person)) {
    return { person, x: person.x, position };
  }
  return { person, x: lerp(before.x, person.x, progress), position };
}

function drawPeople(
  frames: StoreFrames,
  progress: number,
  cars: Map<string, DrawnCar>,
): DrawnPerson[] {
  const { previous, latest } = frames;
  const gap = previous === null ? 0 : latest.step - previous.step;
  const drawn: DrawnPerson[] = [];
  for (const person of latest.people.values()) {
    if (person.mode === 'inside') {
      continue;
    }
    const before = previous?.people.get(person.id);
    // Someone who got off during this delta stays in the car until it has glided to the stop.
    const stillInCar = person.mode !== 'ride' && before?.mode === 'ride' ? before : undefined;
    const placed =
      person.mode === 'ride'
        ? drawRider(person, latest, cars)
        : ((stillInCar !== undefined ? drawRider(stillInCar, latest, cars) : null) ??
          drawWalker(person, before, progress, gap));
    if (placed !== null) {
      drawn.push(placed);
    }
  }
  return drawn;
}

/** Positions of every car and visible person at `progress` between the two buffered states. */
export function drawnFrame(
  frames: StoreFrames,
  progress: number,
  speed: number = gameSpeed(),
): DrawnFrame {
  const cars = drawCars(frames, progress, speed);
  const inside = [...frames.latest.people.values()].filter((person) => person.mode === 'inside');
  const { previous, latest } = frames;
  const steps = previous === null ? 0 : latest.step - previous.step;
  const stepMs = steps > 0 ? deltaIntervalMs(speed) / steps : undefined;
  return { cars, people: drawPeople(frames, progress, cars), inside, stepMs };
}
