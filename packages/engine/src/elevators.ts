import {
  CALL_PATIENCE_STEPS,
  CAR_FLOORS_PER_STEP,
  carCapacity,
  DEFAULT_DWELL_STEPS,
  DEFAULT_RESPONSE_DISTANCE,
  indexToLevel,
  levelToIndex,
  type ElevatorCar,
  type HallCall,
  type HallDirection,
  type Level,
  type Shaft,
} from '@tower-magnate/shared';
import { boardFromQueue, hallCallAge, queueLength } from './elevator-queues';
import type { SimulationSystem, StepContext } from './step';

/** Elevators 10: shafts in id order, each car in index order, then the shaft's dispatch pass. */
export function createElevatorSystem(): SimulationSystem {
  return (context) => {
    for (const shaftId of Object.keys(context.state.shafts).sort(byShaftNumber)) {
      const shaft = context.state.shafts[shaftId] as Shaft;
      dropVanishedCalls(shaft);
      shaft.cars.forEach((_, carIndex) => stepCar(context, shaft, carIndex));
      dispatch(shaft, context.state.step);
    }
  };
}

function byShaftNumber(a: string, b: string): number {
  return Number(a.slice(1)) - Number(b.slice(1));
}

function dense(level: Level): number {
  return levelToIndex(level);
}

/** +1 for up, -1 for down. */
function sign(direction: HallDirection): 1 | -1 {
  return direction === 'up' ? 1 : -1;
}

function opposite(direction: HallDirection): HallDirection {
  return direction === 'up' ? 'down' : 'up';
}

/** How many floors `level` lies ahead of the car in `direction`; negative when behind. */
function floorsAhead(car: ElevatorCar, level: Level, direction: HallDirection): number {
  return (dense(level) - dense(car.level)) * sign(direction);
}

function isFree(car: ElevatorCar): boolean {
  return car.riders.length === 0 && car.assigned.length === 0;
}

function isFull(shaft: Shaft, car: ElevatorCar): boolean {
  return car.riders.length >= carCapacity(shaft.type);
}

function hasCall(car: ElevatorCar, level: Level, direction: HallDirection): boolean {
  return car.assigned.some((call) => call.level === level && call.direction === direction);
}

/** A call whose queue emptied because everyone left is gone (elevators 6.3). */
function dropVanishedCalls(shaft: Shaft): void {
  for (const car of shaft.cars) {
    car.assigned = car.assigned.filter(
      (call) => queueLength(shaft, call.level, call.direction) > 0,
    );
  }
}

/** Levels the car has promised to reach: its riders' destinations and its assigned calls. */
function workLevels(car: ElevatorCar): Level[] {
  return [...car.trips.map((trip) => trip.destination), ...car.assigned.map((call) => call.level)];
}

function hasWorkAhead(car: ElevatorCar, direction: HallDirection): boolean {
  return workLevels(car).some((level) => floorsAhead(car, level, direction) > 0);
}

function hasWorkBehind(car: ElevatorCar, direction: HallDirection): boolean {
  return hasWorkAhead(car, opposite(direction));
}

function hasWorkHere(car: ElevatorCar): boolean {
  return workLevels(car).includes(car.level);
}

/** Elevators 4.4: the nearest rider destination or call in the car's direction, else the farthest call. */
function nextStop(car: ElevatorCar, direction: HallDirection): Level | null {
  const stopsHere = [
    ...car.trips.map((trip) => trip.destination),
    ...car.assigned.filter((call) => call.direction === direction).map((call) => call.level),
  ].filter((level) => floorsAhead(car, level, direction) > 0);
  if (stopsHere.length > 0) {
    return stopsHere.reduce((nearest, level) =>
      floorsAhead(car, level, direction) < floorsAhead(car, nearest, direction) ? level : nearest,
    );
  }
  const turning = car.assigned
    .map((call) => call.level)
    .filter((level) => floorsAhead(car, level, direction) > 0);
  if (turning.length === 0) {
    return null;
  }
  return turning.reduce((farthest, level) =>
    floorsAhead(car, level, direction) > floorsAhead(car, farthest, direction) ? level : farthest,
  );
}

function travelDirection(car: ElevatorCar): HallDirection {
  return car.direction === 'idle' ? 'up' : car.direction;
}

function stepCar(context: StepContext, shaft: Shaft, carIndex: number): void {
  const car = shaft.cars[carIndex] as ElevatorCar;
  switch (car.phase) {
    case 'opening':
      openDoors(context, shaft, carIndex);
      break;
    case 'dwelling':
      dwell(context, shaft, carIndex);
      break;
    case 'closing':
      closeDoors(shaft, car);
      break;
    case 'moving':
      move(context, shaft, carIndex);
      break;
    case 'idle':
      decide(context, shaft, carIndex);
      break;
  }
}

/** An idle car with work leaves or opens its doors at once; a free car away from home goes home. */
function decide(context: StepContext, shaft: Shaft, carIndex: number): void {
  const car = shaft.cars[carIndex] as ElevatorCar;
  if (hasWorkHere(car)) {
    openDoors(context, shaft, carIndex);
    return;
  }
  if (!isFree(car) || car.level !== car.homeLevel) {
    move(context, shaft, carIndex);
  }
}

function move(context: StepContext, shaft: Shaft, carIndex: number): void {
  const car = shaft.cars[carIndex] as ElevatorCar;
  if (hasWorkHere(car)) {
    openDoors(context, shaft, carIndex);
    return;
  }
  const target = chooseTarget(car);
  if (target === null) {
    car.phase = 'idle';
    car.direction = 'idle';
    return;
  }
  const floors = dense(target) - dense(car.level);
  car.direction = floors > 0 ? 'up' : 'down';
  const travelled = Math.min(CAR_FLOORS_PER_STEP[shaft.type], Math.abs(floors));
  car.level = indexToLevel(dense(car.level) + Math.sign(floors) * travelled);
  car.phase = car.level === target ? 'opening' : 'moving';
  if (car.level === target && isFree(car)) {
    car.phase = 'idle';
    car.direction = 'idle';
  }
}

/** The next stop, reversing first when the work is all behind; a free car aims for home. */
function chooseTarget(car: ElevatorCar): Level | null {
  if (isFree(car)) {
    return car.level === car.homeLevel ? null : car.homeLevel;
  }
  const direction = travelDirection(car);
  const ahead = nextStop(car, direction);
  if (ahead !== null) {
    return ahead;
  }
  return nextStop(car, opposite(direction));
}

/** Elevators 4.1: riders get off, the car picks its direction, then people board. */
function openDoors(context: StepContext, shaft: Shaft, carIndex: number): void {
  const car = shaft.cars[carIndex] as ElevatorCar;
  letRidersOut(context, shaft, carIndex);
  car.direction = directionAtStop(shaft, car);
  const direction = travelDirection(car);
  boardFromQueue(shaft, carIndex, car.level, direction, context.state.step);
  car.assigned = car.assigned.filter((call) => call.level !== car.level);
  car.phase = DEFAULT_DWELL_STEPS > 0 ? 'dwelling' : 'closing';
  car.phaseStepsLeft = DEFAULT_DWELL_STEPS;
}

function letRidersOut(context: StepContext, shaft: Shaft, carIndex: number): void {
  const car = shaft.cars[carIndex] as ElevatorCar;
  const staying: number[] = [];
  car.riders.forEach((person, index) => {
    const trip = car.trips[index];
    if (trip && trip.destination === car.level) {
      context.events.push({
        type: 'rideFinished',
        step: context.state.step,
        person,
        shaftId: shaft.id,
        carIndex,
        level: car.level,
        waitSteps: trip.waitSteps,
        rideSteps: context.state.step - trip.boardedStep,
      });
    } else {
      staying.push(index);
    }
  });
  car.riders = staying.map((index) => car.riders[index] as string);
  car.trips = staying.map((index) => car.trips[index] as ElevatorCar['trips'][number]);
}

/** Elevators 4.2: keep going with work ahead, else turn for work behind, else wait to be free. */
function directionAtStop(shaft: Shaft, car: ElevatorCar): ElevatorCar['direction'] {
  const direction = travelDirection(car);
  if (hasWorkAhead(car, direction) || queueLength(shaft, car.level, direction) > 0) {
    return direction;
  }
  if (queueLength(shaft, car.level, opposite(direction)) > 0 || hasWorkBehind(car, direction)) {
    return opposite(direction);
  }
  return direction;
}

function dwell(context: StepContext, shaft: Shaft, carIndex: number): void {
  const car = shaft.cars[carIndex] as ElevatorCar;
  boardFromQueue(shaft, carIndex, car.level, travelDirection(car), context.state.step);
  car.phaseStepsLeft -= 1;
  if (car.phaseStepsLeft <= 0) {
    car.phase = 'closing';
  }
}

/** A car that leaves full gives up the calls it would have answered in its direction (6.3). */
function closeDoors(shaft: Shaft, car: ElevatorCar): void {
  if (isFull(shaft, car)) {
    const direction = travelDirection(car);
    car.assigned = car.assigned.filter((call) => call.direction !== direction);
  }
  car.phase = 'idle';
  if (isFree(car)) {
    car.direction = 'idle';
  }
}

interface WaitingCall extends HallCall {
  age: number;
}

function unassignedCalls(shaft: Shaft, step: number): WaitingCall[] {
  const calls: WaitingCall[] = [];
  for (const key of Object.keys(shaft.queues)) {
    const level = Number(key);
    for (const direction of ['up', 'down'] as const) {
      const age = hallCallAge(shaft, level, direction, step);
      const taken = shaft.cars.some((car) => hasCall(car, level, direction));
      if (age !== null && !taken) {
        calls.push({ level, direction, age });
      }
    }
  }
  return calls.sort(
    (a, b) =>
      b.age - a.age ||
      dense(a.level) - dense(b.level) ||
      Number(a.direction === 'down') - Number(b.direction === 'down'),
  );
}

/** Elevators 6.2: oldest call first, to the nearest eligible car. */
function dispatch(shaft: Shaft, step: number): void {
  for (const call of unassignedCalls(shaft, step)) {
    const choice = pickCar(shaft, call);
    if (choice === null) {
      continue;
    }
    const car = shaft.cars[choice.index] as ElevatorCar;
    const wasFree = isFree(car);
    car.assigned.push({ level: call.level, direction: call.direction });
    if (wasFree) {
      car.direction = headingFor(car, call);
    }
  }
}

function headingFor(car: ElevatorCar, call: HallCall): ElevatorCar['direction'] {
  const floors = dense(call.level) - dense(car.level);
  if (floors === 0) {
    return call.direction;
  }
  return floors > 0 ? 'up' : 'down';
}

function pickCar(shaft: Shaft, call: WaitingCall): { index: number } | null {
  const everyCarFree = shaft.cars.every(isFree);
  let best: { index: number; distance: number; coming: boolean } | null = null;
  for (const [index, car] of shaft.cars.entries()) {
    const distance = Math.abs(dense(call.level) - dense(car.level));
    const coming = isComingCar(shaft, car, call);
    const reachable =
      isFree(car) &&
      (distance <= DEFAULT_RESPONSE_DISTANCE || call.age >= CALL_PATIENCE_STEPS || everyCarFree);
    if (!coming && !reachable) {
      continue;
    }
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance && coming && !best.coming)
    ) {
      best = { index, distance, coming };
    }
  }
  return best;
}

function isComingCar(shaft: Shaft, car: ElevatorCar, call: HallCall): boolean {
  return (
    !isFree(car) &&
    car.direction === call.direction &&
    floorsAhead(car, call.level, call.direction) > 0 &&
    !isFull(shaft, car)
  );
}
