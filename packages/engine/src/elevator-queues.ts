import {
  carCapacity,
  ELEVATOR_QUEUE_CAPACITY,
  FULL_QUEUE_RECHECK_STEPS,
  FULL_QUEUE_ROUTE_COST,
  type EntityId,
  type HallDirection,
  type Level,
  type QueueEntry,
  type Shaft,
  type TowerState,
} from '@tower-magnate/shared';

function queueAt(shaft: Shaft, level: Level, direction: HallDirection): QueueEntry[] {
  return shaft.queues[String(level)]?.[direction] ?? [];
}

function writableQueue(shaft: Shaft, level: Level, direction: HallDirection): QueueEntry[] {
  const key = String(level);
  shaft.queues[key] ??= { up: [], down: [] };
  return shaft.queues[key][direction];
}

function dropEmptyStops(shaft: Shaft): void {
  shaft.queues = Object.fromEntries(
    Object.entries(shaft.queues).filter(([, stop]) => stop.up.length + stop.down.length > 0),
  );
}

export function queueLength(shaft: Shaft, level: Level, direction: HallDirection): number {
  return queueAt(shaft, level, direction).length;
}

export function isQueueFull(shaft: Shaft, level: Level, direction: HallDirection): boolean {
  return queueLength(shaft, level, direction) >= ELEVATOR_QUEUE_CAPACITY;
}

/** Added to the cost of a ride while its queue is full (routing section 8.3). */
export function fullQueueSurcharge(shaft: Shaft, level: Level, direction: HallDirection): number {
  return isQueueFull(shaft, level, direction) ? FULL_QUEUE_ROUTE_COST : 0;
}

/** The step at which a person who found the queue full looks at it again. */
export function nextQueueCheckStep(step: number): number {
  return step + FULL_QUEUE_RECHECK_STEPS;
}

/** Puts a person at the back of a queue. Returns false, and changes nothing, when it is full. */
export function joinQueue(
  shaft: Shaft,
  level: Level,
  direction: HallDirection,
  person: EntityId,
  destination: Level,
  step: number,
): boolean {
  if (isQueueFull(shaft, level, direction)) {
    return false;
  }
  writableQueue(shaft, level, direction).push({ person, destination, joinedStep: step });
  return true;
}

/** A hall call is a non-empty queue; its age counts from when the person at the front joined. */
export function hallCallAge(
  shaft: Shaft,
  level: Level,
  direction: HallDirection,
  step: number,
): number | null {
  const front = queueAt(shaft, level, direction)[0];
  return front ? step - front.joinedStep : null;
}

/** Takes people out of every queue of every shaft; those behind move up. */
export function leaveQueues(state: TowerState, people: readonly EntityId[]): void {
  const leaving = new Set(people);
  if (leaving.size === 0) {
    return;
  }
  for (const shaft of Object.values(state.shafts)) {
    for (const stop of Object.values(shaft.queues)) {
      stop.up = stop.up.filter((entry) => !leaving.has(entry.person));
      stop.down = stop.down.filter((entry) => !leaving.has(entry.person));
    }
    dropEmptyStops(shaft);
    for (const car of shaft.cars) {
      const staying = car.riders.map((rider) => !leaving.has(rider));
      car.riders = car.riders.filter((_, index) => staying[index]);
      car.trips = car.trips.filter((_, index) => staying[index]);
    }
  }
}

/**
 * Boards people from the front of a queue into a car, in queue order, until the queue is empty
 * or the car is full, at most `limit` people (elevators 4.1 and 4.3). Returns who boarded.
 */
export function boardFromQueue(
  shaft: Shaft,
  carIndex: number,
  level: Level,
  direction: HallDirection,
  step: number,
  limit = Number.POSITIVE_INFINITY,
): EntityId[] {
  const car = shaft.cars[carIndex];
  if (!car) {
    return [];
  }
  const room = Math.min(limit, Math.max(0, carCapacity(shaft.type) - car.riders.length));
  const queue = queueAt(shaft, level, direction);
  const boarding = queue.slice(0, room);
  if (boarding.length > 0) {
    writableQueue(shaft, level, direction).splice(0, boarding.length);
    car.riders.push(...boarding.map((entry) => entry.person));
    car.trips.push(
      ...boarding.map((entry) => ({
        destination: entry.destination,
        boardedStep: step,
        waitSteps: step - entry.joinedStep,
      })),
    );
    dropEmptyStops(shaft);
  }
  return boarding.map((entry) => entry.person);
}
