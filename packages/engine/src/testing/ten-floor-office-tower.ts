import type { PlannedUnit, TowerPlan } from './tower-builder';
import { plainTowerPlan } from './tower-builder';

const OFFICE_WIDTH = 9;
const OFFICES_PER_FLOOR = 10;

export const OFFICE_WEEK_BUDGET_MS = 2000;

/** Ten floors, 90 offices on levels 2..10 and one standard shaft. */
export function tenFloorOfficeTowerPlan(): TowerPlan {
  const units: PlannedUnit[] = [];
  for (let level = 2; level <= 10; level++) {
    for (let slot = 0; slot < OFFICES_PER_FLOOR; slot++) {
      units.push({ type: 'office', level, x: 104 + slot * OFFICE_WIDTH });
    }
  }
  return {
    ...plainTowerPlan(10, 100, 199),
    units,
    shafts: [{ type: 'standard', x: 100, bottom: 1, top: 10 }],
  };
}
