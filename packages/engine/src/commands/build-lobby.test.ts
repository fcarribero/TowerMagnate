import type { Command, LobbyHeight, QueuedCommand, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { addOccupant, setStructure, structureAt } from '../grid';
import { hashState } from '../hash';
import { createTower } from '../state';
import { step } from '../step';

function lobby(level: number, x0: number, x1: number, height: LobbyHeight = 1): QueuedCommand {
  return { id: 'c1', command: { type: 'buildLobby', level, x0, x1, height } };
}

function run(tower: TowerState, ...commands: QueuedCommand[]) {
  return step(tower, commands, 0);
}

function lastResult(tower: TowerState, ...commands: QueuedCommand[]) {
  const { state, results } = run(tower, ...commands);
  const result = results.at(-1);
  if (!result) throw new Error('Expected a command result');
  return { state, result };
}

function rejection(tower: TowerState, command: QueuedCommand) {
  const before = hashState(tower);
  const { state, result } = lastResult(tower, command);
  expect(hashState(state)).toBe(before);
  return result.ok ? null : result.error;
}

/** Main lobby on 10..29 and floors 2..level-1 over it, ready for a sky lobby on `level`. */
function towerReadyForSkyLobby(level: number): TowerState {
  const tower = createTower(1);
  setStructure(tower.grid, 1, 10, 29, 'lobby');
  tower.grid.mainLobbyHeight = 1;
  for (let floorLevel = 2; floorLevel < level; floorLevel++) {
    setStructure(tower.grid, floorLevel, 10, 29, 'floor');
  }
  return tower;
}

describe('buildLobby', () => {
  it('places the first main lobby anywhere on level 1 and charges $5,000 per cell', () => {
    const { state, result } = lastResult(createTower(1), lobby(1, 100, 119));
    expect(result).toEqual({ id: 'c1', ok: true, step: 0, cost: 100_000, refund: 0 });
    expect(state.grid.levels[1]?.structure).toEqual([{ kind: 'lobby', x0: 100, x1: 119 }]);
    expect(state.grid.mainLobbyHeight).toBe(1);
  });

  it('covers every row of a tall lobby and charges columns times height', () => {
    const { state, result } = lastResult(createTower(1), lobby(1, 0, 9, 3));
    expect(result.ok && result.cost).toBe(10 * 3 * 5_000);
    expect(structureAt(state.grid, 2, 5)).toBe('lobby');
    expect(structureAt(state.grid, 3, 5)).toBe('lobby');
    expect(structureAt(state.grid, 4, 5)).toBeNull();
    expect(state.grid.mainLobbyHeight).toBe(3);
  });

  it('extends the main lobby and skips columns that are already lobby (C-17)', () => {
    const { state, result } = lastResult(createTower(1), lobby(1, 10, 19), lobby(1, 15, 24));
    expect(result.ok && result.cost).toBe(5 * 5_000);
    expect(state.grid.levels[1]?.structure).toEqual([{ kind: 'lobby', x0: 10, x1: 24 }]);
  });

  it('places a sky lobby on floor 15, converting floor and recording its height', () => {
    const tower = towerReadyForSkyLobby(15);
    setStructure(tower.grid, 15, 10, 19, 'floor');
    const { state, result } = lastResult(tower, lobby(15, 10, 29, 2));
    expect(result.ok && result.cost).toBe(20 * 2 * 5_000);
    expect(structureAt(state.grid, 15, 12)).toBe('lobby');
    expect(structureAt(state.grid, 16, 25)).toBe('lobby');
    expect(state.grid.skyLobbyHeights[15]).toBe(2);
  });

  it('allows separate sky lobby runs on one level', () => {
    const tower = towerReadyForSkyLobby(30);
    const { result } = lastResult(tower, lobby(30, 10, 12), lobby(30, 20, 22));
    expect(result.ok).toBe(true);
  });

  it('rejects a lobby on a level that is not 1 or a sky lobby floor (C-15)', () => {
    expect(rejection(towerReadyForSkyLobby(16), lobby(16, 10, 12))).toBe('LOBBY_FLOOR_NOT_ALLOWED');
    expect(rejection(createTower(1), lobby(-1, 10, 12))).toBe('LOBBY_FLOOR_NOT_ALLOWED');
  });

  it('rejects heights other than 1, 2 and 3 (C-16)', () => {
    const tooTall = { type: 'buildLobby', level: 1, x0: 0, x1: 5, height: 4 } as unknown as Command;
    expect(rejection(createTower(1), { id: 'c1', command: tooTall })).toBe('INVALID_COMMAND');
    expect(rejection(createTower(1), lobby(1, 9, 5))).toBe('INVALID_COMMAND');
  });

  it('rejects a run where every column is already lobby (C-17)', () => {
    const { state } = run(createTower(1), lobby(1, 10, 19));
    expect(rejection(state, lobby(1, 12, 15))).toBe('NOTHING_TO_BUILD');
  });

  it('keeps one height per lobby level (C-18)', () => {
    const { state } = run(createTower(1), lobby(1, 10, 19, 2));
    expect(rejection(state, lobby(1, 20, 25, 1))).toBe('LOBBY_HEIGHT_MISMATCH');
    const sky = run(towerReadyForSkyLobby(15), lobby(15, 10, 12, 1)).state;
    expect(rejection(sky, lobby(15, 20, 22, 3))).toBe('LOBBY_HEIGHT_MISMATCH');
  });

  it('keeps the main lobby contiguous (C-19)', () => {
    const { state } = run(createTower(1), lobby(1, 10, 19));
    expect(rejection(state, lobby(1, 21, 25))).toBe('LOBBY_NOT_CONTIGUOUS');
    expect(lastResult(state, lobby(1, 20, 25)).result.ok).toBe(true);
    expect(lastResult(state, lobby(1, 0, 9)).result.ok).toBe(true);
  });

  it('rejects a lobby over occupied cells on any of its rows (C-20)', () => {
    const tower = towerReadyForSkyLobby(15);
    setStructure(tower.grid, 15, 10, 29, 'floor');
    addOccupant(tower.grid, 16, 20, 28, { kind: 'unit', id: 'u1' });
    expect(lastResult(tower, lobby(15, 10, 20, 1)).result.ok).toBe(true);
    expect(rejection(tower, lobby(15, 10, 20, 2))).toBe('CELL_OCCUPIED');
  });

  it('rejects a sky lobby without structure below it', () => {
    expect(rejection(towerReadyForSkyLobby(15), lobby(15, 25, 35))).toBe('NO_SUPPORT');
    expect(rejection(createTower(1), lobby(45, 10, 12))).toBe('NO_SUPPORT');
  });

  it('rejects cells outside the grid (C-01)', () => {
    expect(rejection(createTower(1), lobby(1, 370, 375))).toBe('OUT_OF_BOUNDS');
  });
});
