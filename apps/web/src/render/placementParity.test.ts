import { step } from '@tower-magnate/engine';
import { addOccupant, setStructure } from '@tower-magnate/engine';
import { buildTower, plainTowerPlan, type TowerPlan } from '@tower-magnate/engine/testing';
import {
  LAST_COLUMN,
  TOWER_LAYOUT,
  UNIT_CATALOG,
  levelToIndex,
  type Command,
  type ErrorCode,
  type Level,
  type ShaftType,
  type TowerState,
  type UnitType,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import {
  checkFloor,
  checkLobby,
  checkPlacement,
  checkShaft,
  isGhostTool,
  type PlacementWorld,
} from './placementCheck';

/**
 * The placement preview must predict the server: green means the click builds, red means the
 * server refuses, with the same error code. Each test sweeps positions and tools over a tower laid
 * out with the engine's test builder and compares the client check to the engine command.
 */

function structureRows(state: TowerState): Map<Level, string> {
  const rows = new Map<Level, string>();
  for (const [level, row] of Object.entries(state.grid.levels)) {
    if (!row) continue;
    const cells = Array<string>(TOWER_LAYOUT.siteWidthCells).fill('.');
    for (const span of row.structure) {
      cells.fill(span.kind === 'lobby' ? 'l' : 'f', span.x0, span.x1 + 1);
    }
    for (const span of row.occupants) {
      if (span.occupant.kind === 'ruins') cells.fill('r', span.x0, span.x1 + 1);
    }
    rows.set(Number(level), cells.join(''));
  }
  return rows;
}

/** What the server snapshot tells the client, built straight from the engine state. */
function worldOf(state: TowerState): PlacementWorld {
  const sites = Object.values(state.sites).map((site) => ({ ...site, construction: 0 }));
  return {
    structure: structureRows(state),
    units: [...Object.values(state.units), ...sites],
    transports: Object.values(state.transports),
    shafts: Object.values(state.shafts),
    money: state.money,
    stars: state.stars,
    bombActive: state.activeEvents.some((event) => event.kind === 'bomb'),
    mainLobbyHeight: state.grid.mainLobbyHeight,
    skyLobbyHeights: state.grid.skyLobbyHeights as Record<string, 1 | 2 | 3>,
    cars: Object.values(state.shafts).flatMap((shaft) =>
      shaft.cars.map((car) => ({
        shaftId: shaft.id,
        position: levelToIndex(car.level),
        load: car.riders.length,
      })),
    ),
  };
}

function serverSays(state: TowerState, command: Command): ErrorCode | null {
  const { results } = step(state, [{ id: 'c1', command }], 0);
  const [result] = results;
  if (!result) throw new Error('Expected one command result');
  return result.ok ? null : result.error;
}

interface Probe {
  label: string;
  command: Command;
  client: ErrorCode | null;
}

function mismatches(state: TowerState, probes: readonly Probe[]): string[] {
  const found: string[] = [];
  for (const probe of probes) {
    const server = serverSays(state, probe.command);
    if (server !== probe.client) {
      found.push(`${probe.label}: client ${probe.client ?? 'ok'}, server ${server ?? 'ok'}`);
    }
  }
  return found;
}

const LEVELS: Level[] = [-4, -3, -2, -1, 1, 2, 3, 5, 6, 7, 8, 9, 10, 15, 16];
const TOP_LEVELS: Level[] = [100, 103, 104];
const COLUMNS = [
  -1, 0, 3, 8, 12, 14, 17, 20, 24, 30, 40, 44, 50, 56, 60, 70, 90, 100, 104, 112, 120, 126, 130,
  374,
];
const UNIT_TOOLS = (Object.keys(UNIT_CATALOG) as UnitType[]).filter(isGhostTool);

function unitProbes(state: TowerState, levels: readonly Level[]): Probe[] {
  const world = worldOf(state);
  const probes: Probe[] = [];
  for (const type of UNIT_TOOLS) {
    for (const level of levels) {
      for (const x of COLUMNS) {
        const command = { type: 'buildUnit', unitType: type, x, level } as Command;
        const isTransport = type === 'stairs' || type === 'escalator';
        probes.push({
          label: `${type} at ${x},${level}`,
          command: isTransport
            ? ({ type: 'buildTransport', transportType: type, x, level } as Command)
            : command,
          client: checkPlacement(type, x, level, world).problem,
        });
      }
    }
  }
  return probes;
}

function floorProbes(state: TowerState): Probe[] {
  const world = worldOf(state);
  const spans = [
    [0, 0],
    [5, 12],
    [10, 40],
    [36, 44],
    [70, 90],
    [78, 82],
    [370, 374],
    [374, 376],
    [20, 10],
  ] as const;
  const probes: Probe[] = [];
  for (const level of [...LEVELS, ...TOP_LEVELS, 0, 105, 106]) {
    for (const [x0, x1] of spans) {
      probes.push({
        label: `floor ${x0}..${x1} at ${level}`,
        command: { type: 'buildFloor', level, x0, x1 },
        client: checkFloor(level, x0, x1, world),
      });
    }
  }
  return probes;
}

function lobbyProbes(state: TowerState): Probe[] {
  const world = worldOf(state);
  const spans = [
    [0, 10],
    [10, 40],
    [40, 90],
    [90, 100],
    [78, 82],
    [20, 30],
  ] as const;
  const probes: Probe[] = [];
  for (const level of [1, 2, 15, 16, 30, 3, -1]) {
    for (const height of [1, 2, 3] as const) {
      for (const [x0, x1] of spans) {
        probes.push({
          label: `lobby ${x0}..${x1} h${height} at ${level}`,
          command: { type: 'buildLobby', level, x0, x1, height },
          client: checkLobby(level, x0, x1, height, world),
        });
      }
    }
  }
  return probes;
}

function shaftProbes(state: TowerState): Probe[] {
  const world = worldOf(state);
  const probes: Probe[] = [];
  const types: ShaftType[] = ['standard', 'service', 'express'];
  const ranges = [
    [1, 1],
    [1, 8],
    [2, 6],
    [-2, 1],
    [-3, 15],
    [1, 15],
    [1, 30],
    [3, 20],
    [-4, 2],
    [14, 16],
    [5, 5],
  ] as const;
  for (const type of types) {
    for (const x of [-1, 0, 10, 20, 30, 36, 40, 45, 50, 60, 76, 78, 79]) {
      for (const [bottom, top] of ranges) {
        probes.push({
          label: `${type} shaft at ${x}, ${bottom}..${top}`,
          command: { type: 'buildShaft', shaftType: type, x, bottom, top },
          client: checkShaft(type, x, bottom, top, world),
        });
      }
    }
  }
  for (const shaft of Object.values(state.shafts)) {
    for (const bottom of [-4, -3, -1, 1, 2, 5, 8, 10]) {
      for (const top of [1, 2, 4, 8, 10, 15, 16, 30, 40]) {
        probes.push({
          label: `resize ${shaft.id} to ${bottom}..${top}`,
          command: { type: 'resizeShaft', shaftId: shaft.id, bottom, top },
          client: checkShaft(shaft.type, shaft.x, bottom, top, world, shaft.id),
        });
      }
    }
  }
  return probes;
}

function allProbes(state: TowerState): Probe[] {
  return [
    ...unitProbes(state, [...LEVELS, ...TOP_LEVELS]),
    ...floorProbes(state),
    ...lobbyProbes(state),
    ...shaftProbes(state),
  ];
}

function basePlan(): TowerPlan {
  const plan = plainTowerPlan(16, 0, 130);
  plan.floors = [
    { from: 2, to: 16, x0: 0, x1: 130 },
    { from: -3, to: -1, x0: 0, x1: 130 },
    { from: 17, to: 18, x0: 20, x1: 30 },
    { from: 30, to: 31, x0: 50, x1: 80 },
  ];
  return plan;
}

function richTower(): TowerState {
  const { state } = buildTower({
    ...basePlan(),
    units: [
      { type: 'office', x: 0, level: 2 },
      { type: 'restaurant', x: 20, level: 2 },
      { type: 'cinema', x: 60, level: 5 },
      { type: 'single-room', x: 100, level: 5 },
      { type: 'fast-food', x: 60, level: 8 },
      { type: 'office', x: 95, level: 8 },
      { type: 'parking-ramp', x: 0, level: -1 },
      { type: 'parking-space', x: 16, level: -1 },
      { type: 'recycling-center', x: 40, level: -2 },
    ],
    shafts: [
      { type: 'standard', x: 110, bottom: 1, top: 10 },
      { type: 'express', x: 122, bottom: -3, top: 15 },
    ],
    flights: [
      { type: 'stairs', x: 12, level: 3 },
      { type: 'escalator', x: 50, level: 5 },
      { type: 'escalator', x: 44, level: 9 },
      { type: 'stairs', x: 24, level: 9 },
    ],
  });
  state.money = 50_000_000;
  state.stars = 6;
  return state;
}

function poorTower(): TowerState {
  const state = richTower();
  state.money = 12_000;
  state.stars = 2;
  return state;
}

function brokeTower(): TowerState {
  const state = richTower();
  state.money = -500;
  return state;
}

function ruinedTower(): TowerState {
  const state = richTower();
  state.money = 50_000_000;
  state.stars = 6;
  addOccupant(state.grid, 3, 20, 22, { kind: 'ruins' });
  addOccupant(state.grid, 2, 50, 53, { kind: 'ruins' });
  addOccupant(state.grid, 4, 12, 14, { kind: 'ruins' });
  addOccupant(state.grid, -2, 30, 34, { kind: 'ruins' });
  setStructure(state.grid, 15, 0, 40, 'lobby');
  state.grid.skyLobbyHeights[15] = 2;
  state.sites.u900 = {
    id: 'u900',
    type: 'restaurant',
    x: 70,
    level: 11,
    paid: 0,
    placedAtStep: 0,
    points: 0,
  };
  addOccupant(state.grid, 11, 70, 70 + UNIT_CATALOG.restaurant.width - 1, {
    kind: 'unit',
    id: 'u900',
  });
  return state;
}

function bombedTower(): TowerState {
  const state = richTower();
  state.activeEvents.push({
    kind: 'bomb',
    id: 'e1',
    decision: { deadlineStep: 100, options: [], choice: null },
    ransom: 1000,
    bomb: { x: 0, level: 2 },
    search: null,
  } as never);
  return state;
}

function limitTower(): TowerState {
  const plan = plainTowerPlan(20, 0, 80);
  const flights = Array.from({ length: 64 }, (_, index) => ({
    type: 'stairs' as const,
    x: (index % 8) * 10,
    level: 2 + Math.floor(index / 8) * 2,
  }));
  const { state } = buildTower({ ...plan, flights });
  state.money = 50_000_000;
  state.stars = 6;
  return state;
}

function report(state: TowerState): string[] {
  return mismatches(state, allProbes(state));
}

describe('placement preview agrees with the server', () => {
  it('on a rich tower with units, shafts, stairs and escalators', () => {
    expect(report(richTower())).toEqual([]);
  }, 300_000);

  it('exercises both green and red for every kind of tool', () => {
    const probes = allProbes(richTower());
    for (const kind of [
      'stairs',
      'escalator',
      'office',
      'floor',
      'lobby',
      'standard shaft',
      'resize',
    ]) {
      const ofKind = probes.filter((probe) => probe.label.startsWith(kind));
      expect(
        ofKind.some((probe) => probe.client === null),
        `${kind} has a green`,
      ).toBe(true);
      expect(
        ofKind.some((probe) => probe.client !== null),
        `${kind} has a red`,
      ).toBe(true);
    }
  }, 300_000);

  it('on a tower whose cash and stars are short', () => {
    expect(report(poorTower())).toEqual([]);
  }, 300_000);

  it('on a tower with a negative balance', () => {
    expect(report(brokeTower())).toEqual([]);
  }, 300_000);

  it('on a tower with ruins, a sky lobby and a construction site', () => {
    expect(report(ruinedTower())).toEqual([]);
  }, 300_000);

  it('when a resize would strand riders in a car', () => {
    const state = richTower();
    const shaft = Object.values(state.shafts).find((candidate) => candidate.type === 'standard');
    if (!shaft) throw new Error('Expected a standard shaft');
    shaft.cars[0]!.riders = [{}] as never;
    const world = worldOf(state);
    const probes = [2, 5, 8].map((bottom) => ({
      label: `resize ${shaft.id} to ${bottom}..10`,
      command: { type: 'resizeShaft', shaftId: shaft.id, bottom, top: 10 } as Command,
      client: checkShaft(shaft.type, shaft.x, bottom, 10, world, shaft.id),
    }));
    expect(probes.map((probe) => probe.client)).toEqual([
      'SHAFT_IN_USE',
      'SHAFT_IN_USE',
      'SHAFT_IN_USE',
    ]);
    expect(mismatches(state, probes)).toEqual([]);
  });

  it('while a bomb threat is active', () => {
    const state = bombedTower();
    const probes = unitProbes(state, [2, 3, 4]).filter((probe) =>
      probe.label.startsWith('security'),
    );
    expect(probes.length).toBeGreaterThan(0);
    expect(mismatches(state, probes)).toEqual([]);
  }, 300_000);

  it('with the stairs and escalators limit reached', () => {
    const state = limitTower();
    const probes = unitProbes(state, [2, 3, 4, 5]).filter((probe) =>
      /^(stairs|escalator)/.test(probe.label),
    );
    expect(mismatches(state, probes)).toEqual([]);
  }, 300_000);

  it('refuses an escalator that would end on a level with an office', () => {
    const state = richTower();
    const world = worldOf(state);
    // Level 8 holds an office next to a fast-food, so an escalator ending there must be red.
    expect(checkPlacement('escalator', 20, 8, world).problem).toBe('ESCALATOR_FLOOR_TYPE');
    expect(
      serverSays(state, { type: 'buildTransport', transportType: 'escalator', x: 20, level: 8 }),
    ).toBe('ESCALATOR_FLOOR_TYPE');
  });

  it('keeps the site width in step with the engine', () => {
    expect(LAST_COLUMN).toBe(TOWER_LAYOUT.siteWidthCells - 1);
  });
});
