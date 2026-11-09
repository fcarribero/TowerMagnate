import { type Level, type TowerState, type Unit, type UnitId } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { hashState } from '../hash';
import { addPeopleForUnit, parseUnitNumber } from '../people';
import { deserializeState, serializeState } from '../serialization';
import { buildTower } from '../testing';
import { ruinBlastBox } from './bomb';
import { burnCell, noDamage } from './fire-cells';

const NOON = STEPS_PER_DAY + 12 * STEPS_PER_HOUR;

interface DamagedTower {
  state: TowerState;
  hit: { office: UnitId; condo: UnitId; room: UnitId; space: UnitId };
  spared: UnitId;
}

function unitOf(state: TowerState, id: UnitId): Unit {
  const unit = state.units[id];
  if (!unit) throw new Error(`${id} missing`);
  return unit;
}

function firstPersonOf(state: TowerState, id: UnitId): number {
  const home = parseUnitNumber(id);
  const slot = state.people.homeUnit.indexOf(home ?? -1);
  if (slot < 0) throw new Error(`${id} has nobody`);
  return state.people.id[slot] as number;
}

/**
 * An office with filed trips, a condo with residents, a hotel room with a stay and a parking
 * space held by a worker of the spared office, all inside the blast box of a bomb on level 2.
 */
function damagedTower(): DamagedTower {
  const { state, unitIds } = buildTower({
    lobby: { x0: 100, x1: 199 },
    floors: [
      { from: -1, to: -1, x0: 100, x1: 199 },
      { from: 2, to: 12, x0: 100, x1: 199 },
    ],
    units: [
      { type: 'office', level: 2, x: 120 },
      { type: 'condo', level: 3, x: 120 },
      { type: 'single-room', level: 4, x: 120 },
      { type: 'parking-space', level: -1, x: 120 },
      { type: 'office', level: 12, x: 120 },
    ],
  });
  const [office, condo, room, space, spared] = unitIds as UnitId[];
  if (!office || !condo || !room || !space || !spared) throw new Error('units missing');
  state.step = NOON;
  state.stars = 3;
  for (const id of [office, condo, room, spared]) addPeopleForUnit(state, id);
  state.unitLedger[office] = [NOON - 600, 40, NOON - 300, 25];
  state.unitLedger[condo] = [NOON - 900, 10];
  state.unitLedger[spared] = [NOON - 200, 30];
  const hotel = unitOf(state, room).hotel;
  if (!hotel) throw new Error('room has no hotel state');
  Object.assign(hotel, { state: 'occupied', checkInStep: NOON - 60, stayEndStep: NOON + 9000 });
  state.parking.spaces[firstPersonOf(state, spared)] = parseUnitNumber(space) as number;
  state.parking.spaces[firstPersonOf(state, office)] = 0;
  return { state, hit: { office, condo, room, space }, spared };
}

function explodeOnLevelTwo(tower: DamagedTower): void {
  ruinBlastBox(tower.state, { x: 125, level: 2 as Level });
}

function burnEveryHitUnit(tower: DamagedTower): void {
  for (const id of Object.values(tower.hit)) {
    const unit = unitOf(tower.state, id);
    burnCell(tower.state, unit.level, unit.x, noDamage());
  }
}

function expectNoReferenceTo(state: TowerState, ids: readonly UnitId[]): void {
  const numbers = ids.map((id) => parseUnitNumber(id));
  for (const id of ids) {
    expect(state.units[id]).toBeUndefined();
    expect(state.unitLedger[id]).toBeUndefined();
  }
  for (const number of numbers) {
    expect(state.people.homeUnit).not.toContain(number);
    expect(Object.values(state.parking.spaces)).not.toContain(number);
  }
}

describe.each([
  ['a bomb', explodeOnLevelTwo],
  ['a fire', burnEveryHitUnit],
])('a tower after %s destroys units', (_cause, destroy) => {
  it('keeps no reference to the destroyed units', () => {
    const tower = damagedTower();
    destroy(tower);
    expectNoReferenceTo(tower.state, Object.values(tower.hit));
    expect(tower.state.units[tower.spared]).toBeDefined();
    expect(tower.state.unitLedger[tower.spared]).toEqual([NOON - 200, 30]);
    expect(Object.values(tower.state.parking.spaces)).toEqual([0]);
  });

  it('saves and loads to the same state hash', () => {
    const tower = damagedTower();
    destroy(tower);
    const restored = deserializeState(serializeState(tower.state));
    expect(hashState(restored)).toBe(hashState(tower.state));
  });
});
