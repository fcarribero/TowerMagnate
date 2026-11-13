import { levelToIndex, type CarView, type PersonView } from '@tower-magnate/shared';
import type { StoreFrames } from './clientStore';
import { carKey, type GameState } from './gameState';

/** Real time between two deltas from the server. The client draws one delta behind. */
export const DELTA_INTERVAL_MS = 200;

/** Buffered deltas further apart than this many steps make cars snap instead of glide. */
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
}

export interface DrawnFrame {
  readonly cars: ReadonlyMap<string, DrawnCar>;
  readonly people: readonly DrawnPerson[];
  /** People inside their unit; they have no route, so the renderer moves them in the unit. */
  readonly inside?: readonly PersonView[];
  /** Real milliseconds one simulation step lasts, from the two buffered deltas. */
  readonly stepMs?: number;
}

/** How far the drawing has moved from the previous delta to the latest one, from 0 to 1. */
export function progressSince(latestArrivedAtMs: number, nowMs: number): number {
  const elapsed = nowMs - latestArrivedAtMs;
  return Math.min(Math.max(elapsed / DELTA_INTERVAL_MS, 0), 1);
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function carsSnap(previous: GameState | null, latest: GameState): boolean {
  return previous === null || latest.step - previous.step > CAR_SNAP_GAP_STEPS;
}

function drawCars(frames: StoreFrames, progress: number): Map<string, DrawnCar> {
  const { previous, latest } = frames;
  const snapAll = carsSnap(previous, latest);
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

function drawWalker(
  person: PersonView,
  before: PersonView | undefined,
  progress: number,
): DrawnPerson {
  const position = levelToIndex(person.level);
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
        : (stillInCar !== undefined ? drawRider(stillInCar, latest, cars) : null) ??
          drawWalker(person, before, progress);
    if (placed !== null) {
      drawn.push(placed);
    }
  }
  return drawn;
}

/** Positions of every car and visible person at `progress` between the two buffered states. */
export function drawnFrame(frames: StoreFrames, progress: number): DrawnFrame {
  const cars = drawCars(frames, progress);
  const inside = [...frames.latest.people.values()].filter((person) => person.mode === 'inside');
  const { previous, latest } = frames;
  const steps = previous === null ? 0 : latest.step - previous.step;
  const stepMs = steps > 0 ? DELTA_INTERVAL_MS / steps : undefined;
  return { cars, people: drawPeople(frames, progress, cars), inside, stepMs };
}
