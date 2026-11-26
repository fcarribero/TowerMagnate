import type { CommandHandler } from '../step';
import { idleCar, isExpressStop, isInsideShaft, maxCarsPerShaft, shaftPrices } from './shafts';
import { isInteger, negativeBalanceError, payForConstruction } from './structure';

/** C-41. A new car waits idle at its home level, which must be inside the shaft. */
export const addCar: CommandHandler<'addCar'> = (context, command) => {
  const { shaftId, homeLevel } = command;
  if (typeof shaftId !== 'string' || !isInteger(homeLevel)) {
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
  if (shaft.cars.length >= maxCarsPerShaft(shaft.type)) {
    return { ok: false, error: 'CAR_LIMIT' };
  }
  if (!isInsideShaft(shaft, homeLevel)) {
    return { ok: false, error: 'OUT_OF_BOUNDS' };
  }
  if (shaft.type === 'express' && !isExpressStop(homeLevel)) {
    return { ok: false, error: 'EXPRESS_STOP_NOT_ALLOWED' };
  }

  const cost = shaftPrices(shaft.type).car;
  const paymentError = payForConstruction(state, cost);
  if (paymentError) {
    return { ok: false, error: paymentError };
  }
  shaft.cars.push(idleCar(homeLevel, cost, state.step));
  return { ok: true, cost, refund: 0, events: [] };
};

/** C-42 and C-44, in the demolition check order. */
export const removeCar: CommandHandler<'removeCar'> = (context, command) => {
  const { shaftId, carIndex } = command;
  if (typeof shaftId !== 'string' || !isInteger(carIndex)) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const shaft = context.state.shafts[shaftId];
  const car = shaft?.cars[carIndex];
  if (!shaft || !car) {
    return { ok: false, error: 'NOTHING_TO_DEMOLISH' };
  }
  if (car.riders.length > 0) {
    return { ok: false, error: 'SHAFT_IN_USE' };
  }
  if (shaft.cars.length === 1) {
    return { ok: false, error: 'LAST_CAR' };
  }
  shaft.cars.splice(carIndex, 1);
  return { ok: true, cost: 0, refund: 0, events: [] };
};
