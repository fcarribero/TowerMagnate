import type { Level, TowerState } from '@tower-magnate/shared';
import { buildTower, plainTowerPlan, type PlannedShaft } from './tower-builder';

export function addFlight(
  state: TowerState,
  type: 'stairs' | 'escalator',
  x: number,
  level: Level,
) {
  const id = `t${state.nextId}`;
  state.nextId += 1;
  state.transports[id] = { id, type, x, level };
  return id;
}

export function hundredFloorTower() {
  const shafts: PlannedShaft[] = [];
  for (let index = 0; index < 12; index++) {
    const type = index < 8 ? 'standard' : index < 10 ? 'service' : 'express';
    const bottom = type === 'express' ? 1 : 2 + index;
    shafts.push({ type, x: 10 + index * 30, bottom, top: type === 'express' ? 90 : bottom + 28 });
  }
  const plan = plainTowerPlan(100, 0, 374);
  plan.shafts = shafts;
  const { state } = buildTower(plan);
  for (let level = 2; level < 100; level += 3) addFlight(state, 'stairs', 4, level);
  return state;
}
