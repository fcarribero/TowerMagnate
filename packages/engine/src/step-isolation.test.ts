import type {
  BombThreat,
  EngineEvent,
  Fire,
  QueuedCommand,
  TowerState,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { STEPS_PER_HOUR } from './calendar';
import { STEPS_PER_DAY } from './clock';
import { openBombThreat, openFire } from './events/decisions';
import { igniteLevel } from './events/fire';
import { noDamage } from './events/fire-cells';
import { hashState } from './hash';
import { addPeopleForUnit } from './people';
import { serializeState } from './serialization';
import { step } from './step';
import { buildTower, plainTowerPlan, type PlannedUnit } from './testing';

/** Freezes every object the state reaches, so a step that writes to any of them throws. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

/** Steps a frozen state, as a snapshot or a save that still holds it would. */
function stepFrozen(state: TowerState, steps: number, commands: QueuedCommand[] = []) {
  return step(deepFreeze(state), commands, steps);
}

const MIXED_UNITS: PlannedUnit[] = [
  { type: 'office', level: 2, x: 110 },
  { type: 'office', level: 2, x: 119 },
  { type: 'office', level: 2, x: 128 },
  { type: 'retail-shop', level: 2, x: 140 },
  { type: 'retail-shop', level: 2, x: 152 },
  { type: 'fast-food', level: 2, x: 170 },
  { type: 'restaurant', level: 2, x: 190 },
  { type: 'single-room', level: 3, x: 110 },
  { type: 'single-room', level: 3, x: 114 },
  { type: 'double-room', level: 3, x: 120 },
  { type: 'suite', level: 3, x: 130 },
  { type: 'housekeeping', level: 3, x: 150 },
  { type: 'condo', level: 4, x: 110 },
  { type: 'condo', level: 4, x: 126 },
  { type: 'condo', level: 4, x: 142 },
  { type: 'cinema', level: 6, x: 110 },
];

/** Offices, shops, food, a cinema, hotel rooms and condos on one shaft. */
function mixedTower(): TowerState {
  const { state } = buildTower({
    ...plainTowerPlan(12, 100, 259),
    units: MIXED_UNITS,
    shafts: [{ type: 'standard', x: 100, bottom: 1, top: 12, cars: 2 }],
  });
  state.stars = 3;
  return state;
}

function eventTypes(events: readonly EngineEvent[]): Set<string> {
  return new Set(events.map((event) => event.type));
}

describe('step leaves the state it was given unchanged', () => {
  it('through 8 days of leases, shop and venue visits, hotel stays, condo sales and grades', () => {
    let state = mixedTower();
    const seen: EngineEvent[] = [];
    for (let day = 0; day < 8; day++) {
      const result = stepFrozen(state, STEPS_PER_DAY);
      seen.push(...result.events);
      state = result.state;
    }

    const types = eventTypes(seen);
    for (const type of ['leaseSigned', 'condoSold', 'hotelCheckIn', 'hotelCheckOut']) {
      expect(types).toContain(type);
    }
    const venues = Object.values(state.units).filter((unit) => unit.venue !== null);
    expect(venues.some((unit) => (unit.venue?.yesterday?.visits ?? 0) > 0)).toBe(true);
    expect(Object.keys(state.unitLedger).length).toBeGreaterThan(0);
  });

  it('one step at a time, the way the server steps a tower', () => {
    let state = stepFrozen(mixedTower(), STEPS_PER_DAY + 7 * STEPS_PER_HOUR).state;
    const changedUnits = new Set<string>();
    for (let at = 0; at < 6 * STEPS_PER_HOUR; at++) {
      const next = stepFrozen(state, 1).state;
      for (const id of Object.keys(next.units)) {
        if (next.units[id] !== state.units[id]) changedUnits.add(id);
      }
      state = next;
    }
    expect(changedUnits.size).toBeGreaterThan(0);
  });

  it('when a bomb explodes and destroys a unit', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(20, 100, 199),
      units: [{ type: 'office', level: 5, x: 120 }],
    });
    state.stars = 2;
    const officeId = unitIds[0] as string;
    addPeopleForUnit(state, officeId);
    state.step = STEPS_PER_DAY + 9 * STEPS_PER_HOUR;
    openBombThreat({ state, events: [] }, 200_000, { x: 124, level: 5 }) as BombThreat;
    const saved = serializeState(state);

    const after = stepFrozen(state, 4 * STEPS_PER_HOUR);

    expect(after.events.some((event) => event.type === 'disaster')).toBe(true);
    expect(after.state.units[officeId]).toBeUndefined();
    expect(state.units[officeId]).toBeDefined();
    expect(serializeState(state)).toBe(saved);
  });

  it('when a fire burns cells and destroys a unit', () => {
    const { state, unitIds } = buildTower({
      ...plainTowerPlan(50, 100, 259),
      units: [{ type: 'office', level: 40, x: 160 }],
    });
    state.stars = 3;
    const officeId = unitIds[0] as string;
    addPeopleForUnit(state, officeId);
    state.step = 2 * STEPS_PER_DAY + 15 * STEPS_PER_HOUR;
    const context = { state, events: [] };
    const fire = openFire(context, 40) as Fire;
    igniteLevel(context, fire, 40, 150, noDamage());
    const saved = serializeState(state);

    const after = stepFrozen(state, STEPS_PER_HOUR);

    expect(after.state.units[officeId]).toBeUndefined();
    expect(state.units[officeId]).toBeDefined();
    expect(serializeState(state)).toBe(saved);
  });

  it('when commands build and demolish in the same call', () => {
    const state = stepFrozen(mixedTower(), STEPS_PER_DAY).state;
    const office = Object.values(state.units).find((unit) => unit.type === 'office');
    const commands: QueuedCommand[] = [
      { id: 'c1', command: { type: 'buildUnit', unitType: 'office', x: 200, level: 8 } },
      { id: 'c2', command: { type: 'demolish', target: { kind: 'unit', id: office?.id ?? '' } } },
    ];
    const saved = serializeState(state);

    const after = stepFrozen(state, STEPS_PER_HOUR, commands);

    expect(after.results.map((result) => result.ok)).toEqual([true, true]);
    expect(serializeState(state)).toBe(saved);
  });
});

describe('a saved or hashed state', () => {
  it('keeps its save text and hash while later steps run from it', () => {
    const state = step(mixedTower(), [], 2 * STEPS_PER_DAY).state;
    const saved = serializeState(state);
    const hash = hashState(state);

    let later = state;
    for (let at = 0; at < 3; at++) later = step(later, [], STEPS_PER_DAY).state;

    expect(serializeState(state)).toBe(saved);
    expect(hashState(state)).toBe(hash);
    expect(hashState(later)).not.toBe(hash);
  });
});
