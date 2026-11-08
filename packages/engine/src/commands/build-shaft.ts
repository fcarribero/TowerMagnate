import {
  ShaftTypeSchema,
  levelToIndex,
  TOWER_LIMITS,
  type Level,
  type OccupantRef,
  type Shaft,
  type TowerState,
} from '@tower-magnate/shared';
import { addOccupant, removeOccupant } from '../grid';
import { applyStops } from './configure-shaft';
import type { CommandHandler } from '../step';
import {
  defaultSchedule,
  defaultStops,
  idleCar,
  isInsideShaft,
  shaftLevels,
  shaftPrices,
  shaftRangeError,
  shaftWidth,
  type ShaftRange,
} from './shafts';
import { isInteger, negativeBalanceError, payForConstruction } from './structure';

function isLevelPair(bottom: unknown, top: unknown): boolean {
  return isInteger(bottom) && isInteger(top) && bottom <= top;
}

function occupy(state: TowerState, shaft: Shaft): void {
  const occupant: OccupantRef = { kind: 'shaft', id: shaft.id };
  const x1 = shaft.x + shaftWidth(shaft.type) - 1;
  for (const level of shaftLevels(shaft)) {
    addOccupant(state.grid, level, shaft.x, x1, occupant);
  }
}

function vacate(state: TowerState, shaft: Shaft): void {
  const occupant: OccupantRef = { kind: 'shaft', id: shaft.id };
  for (const level of shaftLevels(shaft)) {
    removeOccupant(state.grid, level, occupant);
  }
}

function clampLevel(level: Level, range: ShaftRange): Level {
  return Math.min(Math.max(level, range.bottom), range.top);
}

/** Elevators 9.3: new levels join the stops, levels outside the new range leave them. */
function resizedStops(shaft: Shaft, previous: ShaftRange): Level[] {
  const kept = shaft.stops.filter((level) => isInsideShaft(shaft, level));
  const added = defaultStops(shaft.type, shaft).filter((level) => !isInsideShaft(previous, level));
  return [...kept, ...added].sort((a, b) => levelToIndex(a) - levelToIndex(b));
}

/** The nearest stop to a level, the lower one on a tie. */
function nearestStop(stops: Level[], level: Level): Level {
  const distance = (stop: Level) => Math.abs(levelToIndex(stop) - levelToIndex(level));
  return stops.reduce(
    (best, stop) => (distance(stop) < distance(best) ? stop : best),
    stops[0] ?? level,
  );
}

/** C-33 to C-40. Places the shaft with one idle car at the bottom level. */
export const buildShaft: CommandHandler<'buildShaft'> = (context, command) => {
  const { x, bottom, top } = command;
  const type = ShaftTypeSchema.safeParse(command.shaftType);
  if (!type.success || !isInteger(x) || !isLevelPair(bottom, top)) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const { state } = context;
  const balanceError = negativeBalanceError(state);
  if (balanceError) {
    return { ok: false, error: balanceError };
  }
  if (Object.keys(state.shafts).length >= TOWER_LIMITS['elevator-shafts']) {
    return { ok: false, error: 'LIMIT_REACHED' };
  }
  const range = { x, bottom, top };
  const rangeError = shaftRangeError(state, type.data, range, null);
  if (rangeError) {
    return { ok: false, error: rangeError };
  }

  const prices = shaftPrices(type.data);
  const cost = prices.shaft + prices.car;
  const paymentError = payForConstruction(state, cost);
  if (paymentError) {
    return { ok: false, error: paymentError };
  }

  const shaft: Shaft = {
    id: `s${state.nextId}`,
    type: type.data,
    ...range,
    cars: [idleCar(bottom, prices.car, state.step)],
    stops: defaultStops(type.data, range),
    schedule: defaultSchedule(),
    queues: {},
    paid: prices.shaft,
    placedAtStep: state.step,
  };
  state.nextId += 1;
  state.shafts[shaft.id] = shaft;
  occupy(state, shaft);
  return { ok: true, cost, refund: 0, events: [] };
};

/** C-43 and C-44. Moves either end of the shaft for free; idle cars outside it move inside. */
export const resizeShaft: CommandHandler<'resizeShaft'> = (context, command) => {
  const { shaftId, bottom, top } = command;
  if (typeof shaftId !== 'string' || !isLevelPair(bottom, top)) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const { state } = context;
  const balanceError = negativeBalanceError(state);
  if (balanceError) {
    return { ok: false, error: balanceError };
  }
  const shaft = state.shafts[shaftId];
  if (!shaft) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  const range = { x: shaft.x, bottom, top };
  const rangeError = shaftRangeError(state, shaft.type, range, shaft.id);
  if (rangeError) {
    return { ok: false, error: rangeError };
  }
  const strandsRiders = shaft.cars.some(
    (car) => car.riders.length > 0 && !isInsideShaft(range, car.level),
  );
  if (strandsRiders) {
    return { ok: false, error: 'SHAFT_IN_USE' };
  }

  const previous = { bottom: shaft.bottom, top: shaft.top };
  vacate(state, shaft);
  shaft.bottom = bottom;
  shaft.top = top;
  applyStops(shaft, resizedStops(shaft, previous));
  for (const car of shaft.cars) {
    car.homeLevel = nearestStop(shaft.stops, car.homeLevel);
    car.level = clampLevel(car.level, range);
  }
  occupy(state, shaft);
  return { ok: true, cost: 0, refund: 0, events: [] };
};
