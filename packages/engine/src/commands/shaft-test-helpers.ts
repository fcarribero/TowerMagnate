import { finishSites } from '../testing/finish-sites';
import type { Command, QueuedCommand, TowerState } from '@tower-magnate/shared';
import { hashState } from '../hash';
import { step } from '../step';
import { buildTower, plainTowerPlan, type PlannedShaft } from '../testing';

/** Lobby across the whole site, floors 2 to 101 and basements S1 to S9 under it. */
export function fullSiteTower(shafts: readonly PlannedShaft[] = []): TowerState {
  const plan = plainTowerPlan(100, 0, 374);
  plan.floors = [
    ...(plan.floors ?? []),
    { from: 101, to: 101, x0: 0, x1: 374 },
    { from: -9, to: -1, x0: 0, x1: 374 },
  ];
  plan.shafts = shafts;
  const { state } = buildTower(plan);
  state.money = 10_000_000;
  return state;
}

export function run(tower: TowerState, command: Command) {
  const queued: QueuedCommand = { id: 'c1', command };
  const { state: stepped, results } = step(tower, [queued], 0);
  const [result] = results;
  if (!result) throw new Error('Expected one command result');
  return { state: finishSites(stepped), result };
}

/** Runs a command that must succeed and returns the new state and the money it took. */
export function accept(tower: TowerState, command: Command) {
  const { state, result } = run(tower, command);
  if (!result.ok) throw new Error(`Expected success, got ${result.error}`);
  return { state, spent: tower.money - state.money };
}

/** Runs a command that must fail without touching the tower, and returns its error code. */
export function rejection(tower: TowerState, command: Command) {
  const before = hashState(tower);
  const { state, result } = run(tower, command);
  if (hashState(state) !== before) throw new Error('A rejected command changed the tower');
  return result.ok ? null : result.error;
}
