import { lobbiesOf } from '@tower-magnate/engine';
import { buildTower, plainTowerPlan } from '@tower-magnate/engine/testing';
import { InspectDataSchema, lobbyUpgradePrice } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { inspectLobby } from './inspect';

describe('inspectLobby', () => {
  it('shows the lobby place and its upgrades with the price of the next level', () => {
    const { state } = buildTower(plainTowerPlan(3, 0, 40));
    const main = lobbiesOf(state.grid)[0];
    if (!main) throw new Error('main lobby expected');
    state.lobbies = { [main.id]: { level: 1, x0: main.x0, x1: main.x1, upgrades: { plants: 2 } } };
    const data = inspectLobby(state, main.id);
    expect(InspectDataSchema.parse(data)).toEqual(data);
    const cells = main.x1 - main.x0 + 1;
    expect(data).toMatchObject({ kind: 'lobby', id: main.id, status: 'ok', level: 1, from: main.x0 });
    expect(data).toHaveProperty('upgrades', [
      { id: 'plants', level: 2, maxLevel: 3, nextPrice: lobbyUpgradePrice(cells, 2) },
      { id: 'music', level: 0, maxLevel: 3, nextPrice: lobbyUpgradePrice(cells, 0) },
      { id: 'lighting', level: 0, maxLevel: 3, nextPrice: lobbyUpgradePrice(cells, 0) },
    ]);
  });

  it('answers gone for a lobby that is not there', () => {
    const { state } = buildTower(plainTowerPlan(3, 0, 40));
    expect(inspectLobby(state, 'l1x999')).toEqual({ kind: 'lobby', id: 'l1x999', status: 'gone' });
  });
});
