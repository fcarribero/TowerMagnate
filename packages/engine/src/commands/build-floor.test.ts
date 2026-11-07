import type { Command, QueuedCommand, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addOccupant, setStructure, structureAt } from '../grid';
import { hashState } from '../hash';
import { createTower } from '../state';
import { step } from '../step';

function towerWithMainLobby(x0: number, x1: number): TowerState {
  const tower = createTower(1);
  setStructure(tower.grid, 1, x0, x1, 'lobby');
  tower.grid.mainLobbyHeight = 1;
  return tower;
}

function floor(level: number, x0: number, x1: number): QueuedCommand {
  return { id: 'c1', command: { type: 'buildFloor', level, x0, x1 } };
}

function run(tower: TowerState, command: QueuedCommand) {
  const { state, results } = step(tower, [command], 0);
  const [result] = results;
  if (!result) throw new Error('Expected one command result');
  return { state, result };
}

function rejection(tower: TowerState, command: QueuedCommand) {
  const before = hashState(tower);
  const { state, result } = run(tower, command);
  expect(hashState(state)).toBe(before);
  return result.ok ? null : result.error;
}

describe('buildFloor', () => {
  it('lays floor above the main lobby and charges $500 per cell', () => {
    const { state, result } = run(towerWithMainLobby(10, 29), floor(2, 10, 29));
    expect(result).toEqual({ id: 'c1', ok: true, step: 0, cost: 10_000, refund: 0 });
    expect(state.grid.levels[2]?.structure).toEqual([{ kind: 'floor', x0: 10, x1: 29 }]);
  });

  it('skips cells that already have structure and charges only new cells', () => {
    const tower = towerWithMainLobby(10, 29);
    setStructure(tower.grid, 2, 15, 19, 'floor');
    const { state, result } = run(tower, floor(2, 10, 29));
    expect(result.ok && result.cost).toBe(15 * 500);
    expect(state.grid.levels[2]?.structure).toEqual([{ kind: 'floor', x0: 10, x1: 29 }]);
  });

  it('keeps lobby cells as lobby when the run crosses them', () => {
    const tower = towerWithMainLobby(10, 29);
    tower.grid.mainLobbyHeight = 2;
    setStructure(tower.grid, 2, 10, 19, 'lobby');
    const { state, result } = run(tower, floor(2, 10, 29));
    expect(result.ok && result.cost).toBe(10 * 500);
    expect(structureAt(state.grid, 2, 12)).toBe('lobby');
    expect(structureAt(state.grid, 2, 25)).toBe('floor');
  });

  it('builds basements under the lobby, which hang from the level above', () => {
    const tower = towerWithMainLobby(10, 29);
    const first = run(tower, floor(-1, 10, 29));
    expect(first.result.ok).toBe(true);
    const second = run(first.state, floor(-2, 12, 20));
    expect(second.result.ok && second.result.cost).toBe(9 * 500);
  });

  it('accepts floor on level 101 above a finished top floor', () => {
    const tower = towerWithMainLobby(10, 29);
    setStructure(tower.grid, 100, 10, 12, 'floor');
    expect(run(tower, floor(101, 10, 12)).result.ok).toBe(true);
  });

  it('counts a unit as support for the cells above it', () => {
    const tower = towerWithMainLobby(10, 29);
    setStructure(tower.grid, 2, 10, 18, 'floor');
    addOccupant(tower.grid, 3, 10, 18, { kind: 'unit', id: 'u1' });
    expect(run(tower, floor(4, 10, 18)).result.ok).toBe(true);
  });

  it('rejects floor without support, so the main lobby bounds the floors above (C-03)', () => {
    expect(rejection(towerWithMainLobby(10, 29), floor(2, 10, 30))).toBe('NO_SUPPORT');
    expect(rejection(towerWithMainLobby(10, 29), floor(3, 10, 12))).toBe('NO_SUPPORT');
  });

  it('rejects a basement without structure above it (C-04)', () => {
    expect(rejection(towerWithMainLobby(10, 29), floor(-1, 5, 12))).toBe('NO_SUPPORT');
    expect(rejection(towerWithMainLobby(10, 29), floor(-2, 10, 12))).toBe('NO_SUPPORT');
  });

  it('rejects the floor tool on level 1 (C-07)', () => {
    expect(rejection(createTower(1), floor(1, 0, 5))).toBe('LOBBY_LEVEL_ONLY');
  });

  it('rejects levels 102 to 104 (C-08)', () => {
    const tower = towerWithMainLobby(10, 29);
    setStructure(tower.grid, 101, 10, 12, 'floor');
    expect(rejection(tower, floor(102, 10, 12))).toBe('CATHEDRAL_LEVEL_ONLY');
  });

  it('rejects a run with nothing new to build (C-09)', () => {
    const tower = towerWithMainLobby(10, 29);
    setStructure(tower.grid, 2, 10, 29, 'floor');
    expect(rejection(tower, floor(2, 12, 20))).toBe('NOTHING_TO_BUILD');
  });

  it('rejects cells outside the grid and the subway tunnel (C-01, C-02)', () => {
    const tower = towerWithMainLobby(10, 29);
    expect(rejection(tower, floor(2, 370, 375))).toBe('OUT_OF_BOUNDS');
    expect(rejection(tower, floor(105, 0, 1))).toBe('OUT_OF_BOUNDS');
    expect(rejection(tower, floor(0, 0, 1))).toBe('OUT_OF_BOUNDS');
    expect(rejection(tower, floor(-10, 10, 12))).toBe('LEVEL_RESERVED');
  });

  it('rejects malformed commands before anything else', () => {
    const tower = towerWithMainLobby(10, 29);
    expect(rejection(tower, floor(2, 20, 10))).toBe('INVALID_COMMAND');
    expect(rejection(tower, floor(2.5, 10, 12))).toBe('INVALID_COMMAND');
    const malformed = { type: 'buildFloor', level: '2', x0: 10, x1: 12 } as unknown as Command;
    expect(rejection(tower, { id: 'c1', command: malformed })).toBe('INVALID_COMMAND');
  });

  describe('money', () => {
    it('takes the cost from the balance and books it as construction', () => {
      const tower = towerWithMainLobby(10, 29);
      const { state } = run(tower, floor(2, 10, 29));
      expect(state.money).toBe(tower.money - 10_000);
      expect(state.ledger.currentWeek.construction).toEqual({ income: 0, expense: -10_000 });
    });

    it('rejects any floor while the balance is negative (C-54)', () => {
      const tower = towerWithMainLobby(10, 29);
      tower.money = -1;
      expect(rejection(tower, floor(2, 10, 10))).toBe('NEGATIVE_BALANCE');
    });

    it('reports a negative balance before grid errors', () => {
      const tower = towerWithMainLobby(10, 29);
      tower.money = -1;
      expect(rejection(tower, floor(5, 10, 12))).toBe('NEGATIVE_BALANCE');
      expect(rejection(tower, floor(2, 370, 380))).toBe('NEGATIVE_BALANCE');
    });

    it('rejects a floor that costs more than the balance (C-55)', () => {
      const tower = towerWithMainLobby(10, 29);
      tower.money = 20 * 500 - 1;
      expect(rejection(tower, floor(2, 10, 29))).toBe('INSUFFICIENT_FUNDS');
    });

    it('builds when the cost equals the balance, leaving zero', () => {
      const tower = towerWithMainLobby(10, 29);
      tower.money = 20 * 500;
      const { state, result } = run(tower, floor(2, 10, 29));
      expect(result.ok).toBe(true);
      expect(state.money).toBe(0);
    });

    it('reports grid errors before insufficient funds', () => {
      const tower = towerWithMainLobby(10, 29);
      tower.money = 0;
      expect(rejection(tower, floor(3, 10, 12))).toBe('NO_SUPPORT');
    });

    it('charges only for the new cells of a partly built run', () => {
      const tower = towerWithMainLobby(10, 29);
      setStructure(tower.grid, 2, 10, 27, 'floor');
      tower.money = 1_000;
      const { state, result } = run(tower, floor(2, 10, 29));
      expect(result.ok).toBe(true);
      expect(state.money).toBe(0);
    });
  });
});
