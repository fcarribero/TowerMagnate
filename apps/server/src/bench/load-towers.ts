import { STEPS_PER_DAY, step } from '@tower-magnate/engine';
import {
  buildTower,
  plainTowerPlan,
  type PlannedUnit,
  type TowerPlan,
} from '@tower-magnate/engine/testing';
import type { TowerState, Viewport } from '@tower-magnate/shared';

const LEFT_COLUMN = 100;
const RIGHT_COLUMN = 199;
const FIRST_UNIT_COLUMN = 108;
const OFFICE_WIDTH = 9;
const OFFICES_PER_FLOOR = 10;
const CONDO_WIDTH = 16;
const CONDOS_PER_FLOOR = 5;

/** The load starts at 07:00 of the second day, once the tower is lived in and the morning rush begins. */
export const LOAD_START_STEP = STEPS_PER_DAY + Math.floor((STEPS_PER_DAY * 7) / 24);

/**
 * A mid-size tower: offices on the lower half, condos on the upper half and two standard
 * elevators serving every floor.
 */
export function midSizeTowerPlan(floors: number): TowerPlan {
  const lastOfficeLevel = Math.floor(floors / 2);
  const units: PlannedUnit[] = [];
  for (let level = 2; level <= floors; level++) {
    const isOfficeFloor = level <= lastOfficeLevel;
    const width = isOfficeFloor ? OFFICE_WIDTH : CONDO_WIDTH;
    const perFloor = isOfficeFloor ? OFFICES_PER_FLOOR : CONDOS_PER_FLOOR;
    for (let slot = 0; slot < perFloor; slot++) {
      units.push({
        type: isOfficeFloor ? 'office' : 'condo',
        level,
        x: FIRST_UNIT_COLUMN + slot * width,
      });
    }
  }
  return {
    ...plainTowerPlan(floors, LEFT_COLUMN, RIGHT_COLUMN),
    units,
    shafts: [
      { type: 'standard', x: LEFT_COLUMN, bottom: 1, top: floors },
      { type: 'standard', x: LEFT_COLUMN + 4, bottom: 1, top: floors },
    ],
  };
}

/** A viewport that shows the whole tower, the largest delta a client can ask for. */
export function wholeTowerViewport(floors: number): Viewport {
  return { levelFrom: 1, levelTo: floors, xFrom: LEFT_COLUMN, xTo: RIGHT_COLUMN };
}

/** The mid-size tower moved forward to LOAD_START_STEP, ready to be copied for every running tower. */
export function livedInTower(floors: number): TowerState {
  const { state } = buildTower(midSizeTowerPlan(floors));
  return step(state, [], LOAD_START_STEP - state.step).state;
}
