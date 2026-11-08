import {
  DWELL_SECONDS_OPTIONS,
  ELEVATOR_BAND_STARTS,
  ELEVATOR_MODES,
  RESPONSE_DISTANCE_MAX,
  RESPONSE_DISTANCE_MIN,
  levelToIndex,
  type ElevatorCar,
  type ErrorCode,
  type Level,
  type Shaft,
  type ShaftBand,
  type ShaftSchedule,
} from '@tower-magnate/shared';
import type { CommandHandler } from '../step';
import { isExpressStop, isInsideShaft } from './shafts';
import { isInteger } from './structure';

interface ShaftSettings {
  stops: Level[];
  carHomes: Level[];
  schedule: ShaftSchedule;
}

function isBand(value: unknown): value is ShaftBand {
  const band = value as Partial<Record<keyof ShaftBand, unknown>> | null;
  return (
    typeof band === 'object' &&
    band !== null &&
    (ELEVATOR_MODES as readonly unknown[]).includes(band.mode) &&
    (DWELL_SECONDS_OPTIONS as readonly unknown[]).includes(band.dwellSeconds) &&
    isInteger(band.responseDistance) &&
    band.responseDistance >= RESPONSE_DISTANCE_MIN &&
    band.responseDistance <= RESPONSE_DISTANCE_MAX
  );
}

function isDay(value: unknown): value is ShaftBand[] {
  return (
    Array.isArray(value) && value.length === ELEVATOR_BAND_STARTS.length && value.every(isBand)
  );
}

/** Elevators 5, in the order the errors are reported. */
function settingsError(shaft: Shaft, settings: ShaftSettings): ErrorCode | null {
  const { stops, carHomes, schedule } = settings;
  const outsideRange = stops.some((level) => !isInsideShaft(shaft, level));
  const notExpress = shaft.type === 'express' && stops.some((level) => !isExpressStop(level));
  if (notExpress) {
    return 'EXPRESS_STOP_NOT_ALLOWED';
  }
  const homesAreStops = carHomes.every((home) => stops.includes(home));
  const valid =
    !outsideRange &&
    stops.length > 0 &&
    new Set(stops).size === stops.length &&
    carHomes.length === shaft.cars.length &&
    homesAreStops &&
    isDay(schedule.weekday) &&
    isDay(schedule.weekend);
  return valid ? null : 'INVALID_SCHEDULE';
}

function isLevelList(value: unknown): value is Level[] {
  return Array.isArray(value) && value.every(isInteger);
}

/** Nearest enabled stop by floors; a tie goes to the stop ahead in the car's direction. */
function nearestStop(stops: Level[], from: Level, ahead: 1 | -1): Level {
  const distance = (level: Level) => Math.abs(levelToIndex(level) - levelToIndex(from));
  const aheadOf = (level: Level) => Math.sign(levelToIndex(level) - levelToIndex(from)) === ahead;
  return stops.reduce((best, level) => {
    if (distance(level) !== distance(best)) {
      return distance(level) < distance(best) ? level : best;
    }
    return aheadOf(level) && !aheadOf(best) ? level : best;
  });
}

/** Elevators 9.1: calls at a disabled stop are gone and riders bound for it get the nearest stop. */
export function applyStops(shaft: Shaft, stops: Level[]): void {
  const disabled = shaft.stops.filter((level) => !stops.includes(level));
  shaft.queues = Object.fromEntries(
    Object.entries(shaft.queues).filter(([level]) => !disabled.includes(Number(level))),
  );
  for (const car of shaft.cars) {
    car.assigned = car.assigned.filter((call) => stops.includes(call.level));
    redirectRiders(car, stops);
  }
  shaft.stops = [...stops].sort((a, b) => levelToIndex(a) - levelToIndex(b));
}

function redirectRiders(car: ElevatorCar, stops: Level[]): void {
  const ahead = car.direction === 'down' ? -1 : 1;
  for (const trip of car.trips) {
    if (!stops.includes(trip.destination)) {
      trip.destination = nearestStop(stops, trip.destination, ahead);
    }
  }
}

/** Elevators 5: replaces stops, car homes and the band schedule together. Free at any balance. */
export const configureShaft: CommandHandler<'configureShaft'> = (context, command) => {
  const { shaftId, stops, carHomes, schedule } = command;
  const settings = { stops, carHomes, schedule };
  const shape = isLevelList(stops) && isLevelList(carHomes) && typeof schedule === 'object';
  if (typeof shaftId !== 'string' || !shape || schedule === null) {
    return { ok: false, error: 'INVALID_COMMAND' };
  }
  const shaft = context.state.shafts[shaftId];
  if (!shaft) {
    return { ok: false, error: 'UNKNOWN_ENTITY' };
  }
  const error = settingsError(shaft, settings);
  if (error) {
    return { ok: false, error };
  }
  applyStops(shaft, stops);
  shaft.cars.forEach((car, index) => {
    car.homeLevel = carHomes[index] as Level;
  });
  shaft.schedule = {
    weekday: schedule.weekday.map((band) => ({ ...band })),
    weekend: schedule.weekend.map((band) => ({ ...band })),
  };
  return { ok: true, cost: 0, refund: 0, events: [] };
};
