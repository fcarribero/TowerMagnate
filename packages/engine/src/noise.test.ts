import { UNIT_CATALOG, type TowerState, type Unit, type UnitType } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { isNoisy, noisyUnitIds } from './noise';
import { buildTower } from './testing';

interface Placement {
  type: UnitType;
  level?: number;
  x: number;
}

function unitById(state: TowerState, id: string): Unit {
  const unit = state.units[id];
  if (!unit) throw new Error(`No unit ${id}`);
  return unit;
}

/** Builds a wide tower with the unit under test at column 100 and returns its noise flag. */
function noisyWith(unit: UnitType, ...sources: Placement[]): boolean {
  const { state, unitIds } = buildTower({
    lobby: { x0: 0, x1: 374 },
    floors: [{ from: 2, to: 6, x0: 0, x1: 374 }],
    units: [
      { type: unit, level: 3, x: 100 },
      ...sources.map((source) => ({ type: source.type, level: source.level ?? 3, x: source.x })),
    ],
  });
  const [unitId] = unitIds as [string];
  const noisy = isNoisy(state, unitById(state, unitId));
  expect(noisyUnitIds(state).has(unitId)).toBe(noisy);
  return noisy;
}

function rightOf(unit: UnitType, gap: number): number {
  return 100 + UNIT_CATALOG[unit].width + gap;
}

function leftOf(source: UnitType, gap: number): number {
  return 100 - gap - UNIT_CATALOG[source].width;
}

describe.each([
  ['single-room', 20],
  ['double-room', 20],
  ['suite', 20],
  ['condo', 30],
] as const)('noise radius of a %s', (unit, radius) => {
  it(`is noisy at gap ${radius - 1} and ${radius} and quiet at ${radius + 1}, source on the right`, () => {
    expect(noisyWith(unit, { type: 'fast-food', x: rightOf(unit, radius - 1) })).toBe(true);
    expect(noisyWith(unit, { type: 'fast-food', x: rightOf(unit, radius) })).toBe(true);
    expect(noisyWith(unit, { type: 'fast-food', x: rightOf(unit, radius + 1) })).toBe(false);
  });

  it(`is noisy at gap ${radius - 1} and ${radius} and quiet at ${radius + 1}, source on the left`, () => {
    expect(noisyWith(unit, { type: 'fast-food', x: leftOf('fast-food', radius - 1) })).toBe(true);
    expect(noisyWith(unit, { type: 'fast-food', x: leftOf('fast-food', radius) })).toBe(true);
    expect(noisyWith(unit, { type: 'fast-food', x: leftOf('fast-food', radius + 1) })).toBe(false);
  });

  it('is noisy for an adjacent source', () => {
    expect(noisyWith(unit, { type: 'fast-food', x: rightOf(unit, 0) })).toBe(true);
  });
});

describe('noise sources', () => {
  it('never makes an office noisy, since office workers do not mind noise', () => {
    expect(noisyWith('office', { type: 'fast-food', x: rightOf('office', 0) })).toBe(false);
    expect(noisyWith('office', { type: 'cinema', level: 3, x: rightOf('office', 0) })).toBe(false);
  });

  it('ignores a source on another level', () => {
    expect(
      noisyWith('single-room', { type: 'fast-food', level: 4, x: rightOf('single-room', 0) }),
    ).toBe(false);
  });

  it('counts a cinema on every level it covers', () => {
    const cinemaX = rightOf('single-room', 0);
    expect(noisyWith('single-room', { type: 'cinema', level: 2, x: cinemaX })).toBe(true);
    expect(noisyWith('single-room', { type: 'cinema', level: 3, x: cinemaX })).toBe(true);
    expect(noisyWith('single-room', { type: 'cinema', level: 1, x: cinemaX })).toBe(false);
  });

  it('counts a vacant source', () => {
    expect(noisyWith('single-room', { type: 'restaurant', x: rightOf('single-room', 5) })).toBe(
      true,
    );
  });

  it('does not count housekeeping or a retail shop for a hotel room', () => {
    expect(noisyWith('single-room', { type: 'housekeeping', x: rightOf('single-room', 0) })).toBe(
      false,
    );
  });

  it('gives a retail shop no noise at all', () => {
    expect(noisyWith('retail-shop', { type: 'fast-food', x: rightOf('retail-shop', 0) })).toBe(
      false,
    );
  });

  it('lets an office disturb a hotel room', () => {
    expect(noisyWith('single-room', { type: 'office', x: rightOf('single-room', 0) })).toBe(true);
  });

  it('lets hotel rooms disturb a condo', () => {
    expect(noisyWith('condo', { type: 'suite', x: rightOf('condo', 0) })).toBe(true);
  });

  it('stays a flag with five sources', () => {
    const sources = Array.from({ length: 5 }, (_, index) => ({
      type: 'fast-food' as const,
      x: rightOf('single-room', index * 16),
    }));
    expect(noisyWith('single-room', ...sources)).toBe(true);
  });

  it('clears the step the source is demolished and returns when one is built', () => {
    const { state, unitIds } = buildTower({
      lobby: { x0: 0, x1: 374 },
      floors: [{ from: 2, to: 6, x0: 0, x1: 374 }],
      units: [
        { type: 'single-room', level: 3, x: 100 },
        { type: 'fast-food', level: 3, x: rightOf('single-room', 19) },
      ],
    });
    const [roomId, foodId] = unitIds as [string, string];
    const room = unitById(state, roomId);
    expect(isNoisy(state, room)).toBe(true);
    const others = Object.fromEntries(Object.entries(state.units).filter(([id]) => id !== foodId));
    const withFood = state.units;
    state.units = others;
    expect(isNoisy(state, room)).toBe(false);
    state.units = withFood;
    expect(isNoisy(state, room)).toBe(true);
  });
});

describe('noise over floor', () => {
  function condoWithFastFood(floors: { from: number; to: number; x0: number; x1: number }[]) {
    const { state, unitIds } = buildTower({
      lobby: { x0: 0, x1: 374 },
      floors,
      units: [
        { type: 'condo', level: 3, x: 100 },
        { type: 'fast-food', level: 3, x: 100 + UNIT_CATALOG.condo.width + 9 },
      ],
    });
    const [condoId] = unitIds as [string];
    const noisy = isNoisy(state, unitById(state, condoId));
    expect(noisyUnitIds(state).has(condoId)).toBe(noisy);
    return noisy;
  }

  it('reaches a unit when every cell between them has floor', () => {
    expect(condoWithFastFood([{ from: 2, to: 6, x0: 0, x1: 374 }])).toBe(true);
  });

  it('stops at a cell with no floor between the source and the unit', () => {
    const gapColumn = 100 + UNIT_CATALOG.condo.width + 4;
    expect(
      condoWithFastFood([
        { from: 2, to: 6, x0: 0, x1: gapColumn - 1 },
        { from: 2, to: 6, x0: gapColumn + 1, x1: 374 },
      ]),
    ).toBe(false);
  });
});
