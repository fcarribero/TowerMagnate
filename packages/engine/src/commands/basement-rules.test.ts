import type { Command, TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { clearStructure } from '../grid';
import { connectedSpaces } from '../parking';
import { accept, fullSiteTower, rejection } from './shaft-test-helpers';

function siteTower(): TowerState {
  const tower = fullSiteTower();
  tower.money = 99_999_999;
  tower.stars = 6;
  return tower;
}

function build(unitType: string, x: number, level: number): Command {
  return { type: 'buildUnit', unitType, x, level } as Command;
}

function placed(tower: TowerState, unitType: string, x: number, level: number): TowerState {
  return accept(tower, build(unitType, x, level)).state;
}

function errorFor(tower: TowerState, unitType: string, x: number, level: number) {
  return rejection(tower, build(unitType, x, level));
}

function demolishUnitAt(tower: TowerState, x: number, level: number): TowerState {
  const unit = Object.values(tower.units).find((other) => other.x === x && other.level === level);
  if (!unit) throw new Error(`No unit at ${x}, ${level}`);
  return accept(tower, { type: 'demolish', target: { kind: 'unit', id: unit.id } }).state;
}

describe('basement-only units (C-08)', () => {
  it('rejects them above ground', () => {
    expect(errorFor(siteTower(), 'parking-ramp', 0, 5)).toBe('BASEMENT_ONLY');
    expect(errorFor(siteTower(), 'parking-space', 0, 5)).toBe('BASEMENT_ONLY');
    expect(errorFor(siteTower(), 'recycling-center', 0, 5)).toBe('BASEMENT_ONLY');
  });

  it('accepts them in a basement', () => {
    expect(accept(siteTower(), build('recycling-center', 0, -4)).state).toBeDefined();
  });

  it('lets fast food go on S1', () => {
    expect(accept(siteTower(), build('fast-food', 0, -1)).state).toBeDefined();
  });
});

describe('parking ramps (C-47)', () => {
  it('puts the first ramp on S1 only', () => {
    expect(errorFor(siteTower(), 'parking-ramp', 0, -2)).toBe('RAMP_POSITION');
    expect(accept(siteTower(), build('parking-ramp', 0, -1)).state).toBeDefined();
  });

  it('puts later ramps directly below the lowest one in the same column', () => {
    const tower = placed(siteTower(), 'parking-ramp', 10, -1);
    expect(errorFor(tower, 'parking-ramp', 40, -2)).toBe('RAMP_POSITION');
    expect(errorFor(tower, 'parking-ramp', 10, -3)).toBe('RAMP_POSITION');
    expect(errorFor(tower, 'parking-ramp', 10, -1)).not.toBeNull();
    expect(accept(tower, build('parking-ramp', 10, -2)).state).toBeDefined();
  });

  it('allows at most 9 ramps', () => {
    let tower = siteTower();
    for (let level = -1; level >= -9; level -= 1) tower = placed(tower, 'parking-ramp', 0, level);
    expect(Object.keys(tower.units)).toHaveLength(9);
    expect(errorFor(tower, 'parking-ramp', 0, -10)).not.toBeNull();
  });
});

describe('parking spaces (C-48)', () => {
  it('need a ramp or a connected space beside them on their level', () => {
    const tower = placed(siteTower(), 'parking-ramp', 0, -1);
    expect(errorFor(tower, 'parking-space', 40, -1)).toBe('PARKING_NOT_CONNECTED');
    expect(errorFor(tower, 'parking-space', 16, -2)).toBe('PARKING_NOT_CONNECTED');
    expect(accept(tower, build('parking-space', 16, -1)).state).toBeDefined();
  });

  it('need a ramp on their level at all', () => {
    expect(errorFor(siteTower(), 'parking-space', 0, -1)).toBe('PARKING_NOT_CONNECTED');
  });

  it('chain from the ramp to either side', () => {
    let tower = placed(siteTower(), 'parking-ramp', 20, -1);
    tower = placed(tower, 'parking-space', 16, -1);
    tower = placed(tower, 'parking-space', 12, -1);
    tower = placed(tower, 'parking-space', 36, -1);
    expect(connectedSpaces(tower)).toHaveLength(3);
  });

  it('stay in place but disconnected when a demolition cuts the chain, and reconnect when bridged', () => {
    let tower = placed(siteTower(), 'parking-ramp', 0, -1);
    for (const x of [16, 20, 24]) tower = placed(tower, 'parking-space', x, -1);
    tower = demolishUnitAt(tower, 20, -1);
    expect(connectedSpaces(tower).map((space) => space.x)).toEqual([16]);
    expect(Object.values(tower.units).filter((unit) => unit.type === 'parking-space')).toHaveLength(
      2,
    );
    tower = placed(tower, 'parking-space', 20, -1);
    expect(connectedSpaces(tower)).toHaveLength(3);
  });
});

describe('recycling centers (C-49)', () => {
  it('lets the first one go on any basement level', () => {
    expect(accept(siteTower(), build('recycling-center', 100, -6)).state).toBeDefined();
  });

  it('wants later ones next to an existing one', () => {
    const tower = placed(siteTower(), 'recycling-center', 30, -3);
    expect(errorFor(tower, 'recycling-center', 150, -3)).toBe('RECYCLING_NOT_ADJACENT');
    expect(errorFor(tower, 'recycling-center', 56, -3)).toBe('RECYCLING_NOT_ADJACENT');
    expect(errorFor(tower, 'recycling-center', 30, -6)).toBe('RECYCLING_NOT_ADJACENT');
    expect(errorFor(tower, 'recycling-center', 60, -5)).toBe('RECYCLING_NOT_ADJACENT');
  });

  it('accepts a neighbor on the right, on the left, directly below and below at an offset', () => {
    const tower = placed(siteTower(), 'recycling-center', 30, -3);
    expect(accept(tower, build('recycling-center', 55, -3)).state).toBeDefined();
    expect(accept(tower, build('recycling-center', 5, -3)).state).toBeDefined();
    expect(accept(tower, build('recycling-center', 30, -5)).state).toBeDefined();
    expect(accept(tower, build('recycling-center', 50, -5)).state).toBeDefined();
  });

  it('treats the next one as the first when all are demolished', () => {
    let tower = placed(siteTower(), 'recycling-center', 0, -3);
    tower = demolishUnitAt(tower, 0, -3);
    expect(accept(tower, build('recycling-center', 100, -6)).state).toBeDefined();
  });
});

describe('subway station (C-50)', () => {
  it('needs its bottom row on S9', () => {
    expect(errorFor(siteTower(), 'subway-station', 0, -8)).toBe('SUBWAY_POSITION');
    expect(accept(siteTower(), build('subway-station', 0, -9)).state).toBeDefined();
  });

  it('never builds on S10', () => {
    expect(errorFor(siteTower(), 'fast-food', 0, -10)).toBe('LEVEL_RESERVED');
  });
});

describe('cathedral (C-26, C-51)', () => {
  it('needs its bottom row on 101', () => {
    expect(errorFor(siteTower(), 'cathedral', 0, 100)).toBe('CATHEDRAL_POSITION');
    expect(accept(siteTower(), build('cathedral', 0, 101)).state).toBeDefined();
  });

  it('needs structure on all 28 cells of level 100', () => {
    const tower = siteTower();
    clearStructure(tower.grid, 100, 10, 10);
    expect(errorFor(tower, 'cathedral', 0, 101)).toBe('NO_SUPPORT');
  });

  it('leaves levels 102 to 104 to the cathedral', () => {
    expect(errorFor(siteTower(), 'restaurant', 0, 102)).toBe('CATHEDRAL_LEVEL_ONLY');
    expect(errorFor(siteTower(), 'restaurant', 0, 104)).toBe('CATHEDRAL_LEVEL_ONLY');
  });

  it('keeps level 101 for the cathedral, floor, stairs, escalators and shaft tops', () => {
    expect(errorFor(siteTower(), 'restaurant', 0, 101)).toBe('CATHEDRAL_LEVEL_ONLY');
  });
});
