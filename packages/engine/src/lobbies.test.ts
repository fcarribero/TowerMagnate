import {
  lobbyUpgradePrice,
  type GridState,
  type QueuedCommand,
  type TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { step } from './step';
import { buildTower, plainTowerPlan } from './testing';
import {
  cellStressPerMinute,
  findLobby,
  lobbiesOf,
  lobbyComfortAt,
  lobbyUpgrades,
  setLobbyUpgrade,
} from './lobbies';
import { addToCell, heatOf, stressPerMinute } from './heat';

function buy(unitId: string, upgradeId: string, id = 'c1'): QueuedCommand {
  return { id, command: { type: 'buyUpgrade', unitId, upgradeId } };
}

function tower(): TowerState {
  const { state } = buildTower(plainTowerPlan(3, 0, 40));
  state.money = 10_000_000;
  return state;
}

/** A grid with lobby runs on level 1 only, as `[x0, x1]` pairs. */
function lobbyGrid(...runs: [number, number][]): GridState {
  return {
    levels: { 1: { structure: runs.map(([x0, x1]) => ({ kind: 'lobby', x0, x1 })), occupants: [] } },
    mainLobbyHeight: 1,
    skyLobbyHeights: {},
  } as GridState;
}

describe('lobbies', () => {
  it('names each lobby by its base level and first column', () => {
    const state = tower();
    const lobbies = lobbiesOf(state.grid);
    expect(lobbies.length).toBeGreaterThan(0);
    const main = lobbies[0];
    expect(main?.id).toBe(`l1x${main?.x0}`);
    expect(findLobby(state.grid, main?.id ?? '')).toEqual(main);
  });

  it('keeps the higher level of each upgrade when two lobbies join, and both parts keep it after a split', () => {
    const state = { grid: lobbyGrid([0, 9], [20, 29]) } as TowerState;
    const [left, right] = lobbiesOf(state.grid);
    if (!left || !right) throw new Error('two lobbies expected');
    setLobbyUpgrade(state, left, 'plants', 2);
    setLobbyUpgrade(state, right, 'plants', 1);
    setLobbyUpgrade(state, right, 'music', 3);
    // the gap is filled: one lobby from 0 to 29
    state.grid = lobbyGrid([0, 29]);
    const [joined] = lobbiesOf(state.grid);
    if (!joined) throw new Error('one lobby expected');
    expect(lobbyUpgrades(state, joined)).toEqual({ plants: 2, music: 3 });
    setLobbyUpgrade(state, joined, 'lighting', 1);
    expect(Object.keys(state.lobbies ?? {})).toEqual(['l1x0']);
    // cut in two again: both parts keep every level
    state.grid = lobbyGrid([0, 12], [16, 29]);
    const [first, second] = lobbiesOf(state.grid);
    if (!first || !second) throw new Error('two parts expected');
    for (const part of [first, second]) {
      expect(lobbyUpgrades(state, part)).toEqual({ plants: 2, music: 3, lighting: 1 });
    }
    // writing one part keeps the other part's levels as they were
    setLobbyUpgrade(state, first, 'lighting', 2);
    expect(lobbyUpgrades(state, first)).toMatchObject({ lighting: 2 });
    expect(lobbyUpgrades(state, second)).toMatchObject({ lighting: 1 });
  });

  it('sells a level of a lobby upgrade at its cells price and raises it by one', () => {
    const state = tower();
    const main = lobbiesOf(state.grid)[0];
    if (!main) throw new Error('main lobby expected');
    const cells = main.x1 - main.x0 + 1;
    const price = lobbyUpgradePrice(cells, 0);
    const result = step(state, [buy(main.id, 'plants')], 0);
    expect(result.results[0]).toMatchObject({ ok: true, cost: price });
    expect(result.state.money).toBe(state.money - price);
    expect(lobbyUpgrades(result.state, main)).toEqual({ plants: 1 });
    const unknown = step(result.state, [buy('l1x9999', 'plants')], 0);
    expect(unknown.results[0]).toMatchObject({ ok: false, error: 'UNKNOWN_ENTITY' });
    const wrong = step(result.state, [buy(main.id, 'cameras')], 0);
    expect(wrong.results[0]).toMatchObject({ ok: false, error: 'INVALID_COMMAND' });
  });

  it('prices from the lobby cells, never below the base price', () => {
    expect(lobbyUpgradePrice(10, 0)).toBe(50_000);
    expect(lobbyUpgradePrice(100, 0)).toBe(125_000);
    expect(lobbyUpgradePrice(100, 2)).toBe(375_000);
  });

  it('makes people in an upgraded lobby feel less noise, dirt and stress', () => {
    const state = { grid: lobbyGrid([0, 29]), step: 0 } as TowerState;
    const heat = heatOf(state);
    addToCell(heat.noise, 1, 5, 10);
    addToCell(heat.dirt, 1, 5, 2);
    const plain = stressPerMinute(10, 2);
    expect(cellStressPerMinute(state, 1, 5)).toBeCloseTo(plain);
    expect(lobbyComfortAt(state, 1, 5)).toBeNull();
    const [lobby] = lobbiesOf(state.grid);
    if (!lobby) throw new Error('one lobby expected');
    setLobbyUpgrade(state, lobby, 'music', 1);
    setLobbyUpgrade(state, lobby, 'lighting', 2);
    setLobbyUpgrade(state, lobby, 'plants', 3);
    expect(cellStressPerMinute(state, 1, 5)).toBeCloseTo(stressPerMinute(10 * 0.8, 2 * 0.6) * 0.55);
    // a cell outside the lobby is felt as before
    addToCell(heat.noise, 1, 40, 10);
    expect(cellStressPerMinute(state, 1, 40)).toBeCloseTo(stressPerMinute(10, 0));
  });
});
