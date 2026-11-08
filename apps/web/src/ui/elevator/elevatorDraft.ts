import {
  MAX_CARS_PER_SHAFT,
  TOWER_LAYOUT,
  isBasement,
  type Level,
  type ShaftType,
} from '@tower-magnate/shared';

export interface ShaftSettings {
  stops: readonly Level[];
  carHomes: readonly Level[];
}

/** Levels from `bottom` to `top`, skipping the missing level 0. */
export function levelsBetween(bottom: Level, top: Level): Level[] {
  const levels: Level[] = [];
  for (let level = bottom; level <= top; level += 1) {
    if (level !== 0) {
      levels.push(level);
    }
  }
  return levels;
}

export function isExpressStop(level: Level): boolean {
  return (
    isBasement(level) ||
    level === 1 ||
    (TOWER_LAYOUT.skyLobbyFloors as readonly number[]).includes(level)
  );
}

/** Levels a shaft of this type may stop at, from the top down. */
export function offeredLevels(type: ShaftType, bottom: Level, top: Level): Level[] {
  const levels = levelsBetween(bottom, top).reverse();
  return type === 'express' ? levels.filter(isExpressStop) : levels;
}

export function toggleStop(stops: readonly Level[], level: Level): Level[] {
  const next = stops.includes(level) ? stops.filter((stop) => stop !== level) : [...stops, level];
  return next.sort((a, b) => a - b);
}

/** A car whose home is no longer a stop goes to the lowest stop. */
export function homesOnStops(homes: readonly Level[], stops: readonly Level[]): Level[] {
  const lowest = stops[0];
  return homes.map((home) => (stops.includes(home) || lowest === undefined ? home : lowest));
}

export function hasChanges(current: ShaftSettings, draft: ShaftSettings): boolean {
  const same = (a: readonly Level[], b: readonly Level[]) =>
    a.length === b.length && a.every((level, index) => level === b[index]);
  return !same(current.stops, draft.stops) || !same(current.carHomes, draft.carHomes);
}

export function canAddCar(carCount: number): boolean {
  return carCount < MAX_CARS_PER_SHAFT;
}

export function canRemoveCar(carCount: number): boolean {
  return carCount > 1;
}
