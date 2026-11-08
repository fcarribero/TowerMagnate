import { UNIT_CATALOG, type Level, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { buildTower, plainTowerPlan, type PlannedShaft } from '../testing';
import { TransportGraph, type ShaftStops, type UserClass } from './transport-graph';
import { walkableRuns } from './walkable-runs';

function tower(floors: number, shafts: readonly PlannedShaft[] = []) {
  const plan = plainTowerPlan(floors, 0, 374);
  plan.shafts = shafts;
  return buildTower(plan);
}

function addFlight(state: TowerState, type: 'stairs' | 'escalator', x: number, level: Level) {
  const id = `t${state.nextId}`;
  state.nextId += 1;
  state.transports[id] = { id, type, x, level };
  return id;
}

/** Each neighbour as "level:kind", sorted. */
function neighbourCells(graph: TransportGraph, level: Level, x: number, userClass: UserClass) {
  const node = graph.nodeAtCell(level, x);
  if (!node) throw new Error(`No node at ${level}:${x}`);
  return graph
    .neighbours(node.id, userClass)
    .map((link) => `${graph.node(link.to).level}:${link.kind}`)
    .sort();
}

describe('walkable runs', () => {
  it('joins floor and lobby cells into one run per level', () => {
    const { state } = tower(3);
    expect(walkableRuns(state, 1)).toEqual([{ x0: 0, x1: 374 }]);
  });

  it('splits a run at ruins', () => {
    const { state } = tower(3);
    state.grid.levels[2]?.occupants.push({ x0: 10, x1: 12, occupant: { kind: 'ruins' } });
    expect(walkableRuns(state, 2)).toEqual([
      { x0: 0, x1: 9 },
      { x0: 13, x1: 374 },
    ]);
  });

  it('walks past the bottom row of a tall unit and is blocked by its upper row', () => {
    const plan = plainTowerPlan(4, 0, 374);
    plan.units = [{ type: 'cinema', level: 2, x: 20 }];
    const { state } = buildTower(plan);
    const width = UNIT_CATALOG.cinema.width;
    expect(walkableRuns(state, 2)).toEqual([{ x0: 0, x1: 374 }]);
    expect(walkableRuns(state, 3)).toEqual([
      { x0: 0, x1: 19 },
      { x0: 20 + width, x1: 374 },
    ]);
  });
});

describe('transport graph', () => {
  it('links the two ends of stairs at x + 4 for everyone', () => {
    const { state } = tower(5);
    addFlight(state, 'stairs', 40, 2);
    const graph = new TransportGraph(state);
    expect(neighbourCells(graph, 2, 44, 'other')).toEqual(['3:stairs']);
    expect(neighbourCells(graph, 3, 44, 'maid')).toEqual(['2:stairs']);
  });

  it('keeps maids off escalators', () => {
    const { state } = tower(5);
    addFlight(state, 'escalator', 40, 2);
    const graph = new TransportGraph(state);
    expect(neighbourCells(graph, 2, 44, 'other')).toEqual(['3:escalator']);
    expect(neighbourCells(graph, 2, 44, 'maid')).toEqual([]);
  });

  it('chains flights on consecutive levels through one shared node', () => {
    const { state } = tower(5);
    addFlight(state, 'stairs', 40, 2);
    addFlight(state, 'stairs', 40, 3);
    const graph = new TransportGraph(state);
    expect(neighbourCells(graph, 3, 44, 'other')).toEqual(['2:stairs', '4:stairs']);
  });

  it('links every pair of stops of a standard shaft and counts the floors between them', () => {
    const { state, shaftIds } = tower(6, [{ type: 'standard', x: 100, bottom: 1, top: 4 }]);
    const graph = new TransportGraph(state);
    const column = 100 + Math.floor(UNIT_CATALOG['standard-elevator'].width / 2);
    expect(neighbourCells(graph, 1, column, 'other')).toEqual([
      '2:standard',
      '3:standard',
      '4:standard',
    ]);
    const top = graph.nodeAtCell(4, column);
    const links = graph.neighbours(graph.nodeAtCell(1, column)?.id ?? -1, 'other');
    expect(links.find((link) => link.to === top?.id)).toMatchObject({
      via: shaftIds[0],
      floors: 3,
      maidsOnly: false,
    });
  });

  it('counts floors across the ground level without a level 0', () => {
    const plan = plainTowerPlan(3, 0, 374);
    plan.floors = [...(plan.floors ?? []), { from: -2, to: -1, x0: 0, x1: 374 }];
    plan.shafts = [{ type: 'standard', x: 100, bottom: -2, top: 2 }];
    const { state } = buildTower(plan);
    const graph = new TransportGraph(state);
    const column = 100 + Math.floor(UNIT_CATALOG['standard-elevator'].width / 2);
    const node = graph.nodeAtCell(-2, column);
    const toTwo = graph.neighbours(node?.id ?? -1, 'other').find((link) => {
      return graph.node(link.to).level === 2;
    });
    expect(toTwo?.floors).toBe(3);
  });

  it('tags service shaft links as maids only', () => {
    const { state } = tower(4, [{ type: 'service', x: 150, bottom: 1, top: 3 }]);
    const graph = new TransportGraph(state);
    const column = 150 + Math.floor(UNIT_CATALOG['service-elevator'].width / 2);
    expect(neighbourCells(graph, 1, column, 'maid')).toEqual(['2:service', '3:service']);
    expect(neighbourCells(graph, 1, column, 'other')).toEqual([]);
    const link = graph.neighbours(graph.nodeAtCell(1, column)?.id ?? -1, 'maid')[0];
    expect(link?.maidsOnly).toBe(true);
  });

  it('stops an express shaft only on basements, level 1 and sky lobbies', () => {
    const { state } = tower(31, [{ type: 'express', x: 200, bottom: 1, top: 30 }]);
    const graph = new TransportGraph(state);
    const column = 200 + Math.floor(UNIT_CATALOG['express-elevator'].width / 2);
    expect(neighbourCells(graph, 1, column, 'other')).toEqual(['15:express', '30:express']);
    expect(graph.nodeAtCell(7, column)).toBeNull();
  });

  it('drops a disabled stop and brings it back when it is enabled again', () => {
    const { state, shaftIds } = tower(5, [{ type: 'standard', x: 100, bottom: 1, top: 4 }]);
    const column = 100 + Math.floor(UNIT_CATALOG['standard-elevator'].width / 2);
    const graph = new TransportGraph(state);
    const shaftId = shaftIds[0] ?? '';

    const withoutTwo: ShaftStops = new Map([[shaftId, [1, 3, 4]]]);
    graph.rebuild(state, withoutTwo);
    expect(neighbourCells(graph, 1, column, 'other')).toEqual(['3:standard', '4:standard']);
    expect(graph.nodeAtCell(2, column)).toBeNull();

    graph.rebuild(state);
    expect(neighbourCells(graph, 1, column, 'other')).toHaveLength(3);
  });

  it('ignores stops outside the shaft and a shaft with one stop has no links', () => {
    const { state, shaftIds } = tower(5, [{ type: 'standard', x: 100, bottom: 2, top: 4 }]);
    const column = 100 + Math.floor(UNIT_CATALOG['standard-elevator'].width / 2);
    const stops: ShaftStops = new Map([[shaftIds[0] ?? '', [1, 3, 9]]]);
    const graph = new TransportGraph(state, stops);
    expect(neighbourCells(graph, 3, column, 'other')).toEqual([]);
  });

  it('forgets a transport after it is demolished', () => {
    const { state } = tower(5);
    addFlight(state, 'stairs', 40, 2);
    const graph = new TransportGraph(state);
    expect(graph.nodeAtCell(2, 44)).not.toBeNull();
    state.transports = {};
    graph.rebuild(state);
    expect(graph.nodeAtCell(2, 44)).toBeNull();
  });

  it('puts the street entrances at both ends of the main lobby', () => {
    const { state } = tower(2);
    const graph = new TransportGraph(state);
    expect(graph.nodeAtCell(1, 0)?.roles).toEqual(['street-entrance']);
    expect(graph.nodeAtCell(1, 374)?.roles).toEqual(['street-entrance']);
  });

  it('puts the subway entrance on the top row of the station', () => {
    const plan = plainTowerPlan(2, 0, 374);
    plan.floors = [...(plan.floors ?? []), { from: -9, to: -7, x0: 0, x1: 374 }];
    plan.units = [{ type: 'subway-station', level: -9, x: 60 }];
    const { state } = buildTower(plan);
    const graph = new TransportGraph(state);
    const column = 60 + Math.floor(UNIT_CATALOG['subway-station'].width / 2);
    expect(graph.nodeAtCell(-7, column)?.roles).toEqual(['subway-entrance']);
  });

  it('puts nodes of the same run in the same run and nodes of split runs apart', () => {
    const { state } = tower(4, [{ type: 'standard', x: 100, bottom: 1, top: 3 }]);
    addFlight(state, 'stairs', 300, 2);
    state.grid.levels[2]?.occupants.push({ x0: 200, x1: 205, occupant: { kind: 'ruins' } });
    const graph = new TransportGraph(state);
    const shaftNode = graph.nodeAtCell(2, 102);
    const flightNode = graph.nodeAtCell(2, 304);
    expect(shaftNode?.run).not.toBe(flightNode?.run);
    expect(graph.run(shaftNode?.run ?? -1).nodes).toContain(shaftNode?.id);
  });
});

const RUN_AGREEMENT = 0.15;
const MAX_ATTEMPTS = 10;

function timeRuns(action: () => void): number[] {
  return [0, 0, 0].map(() => {
    const start = performance.now();
    action();
    return performance.now() - start;
  });
}

/** Median of three runs, or null when the runs differ by more than 15% in every attempt. */
function medianIfRunsAgree(durations: readonly number[]): number | null {
  const sorted = [...durations].sort((a, b) => a - b);
  const [fastest, median, slowest] = sorted;
  if (fastest === undefined || median === undefined || slowest === undefined) return null;
  return slowest - fastest <= fastest * RUN_AGREEMENT ? median : null;
}

function timeUntilRunsAgree(action: () => void): number | null {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const median = medianIfRunsAgree(timeRuns(action));
    if (median !== null) return median;
  }
  return null;
}

describe('timing agreement', () => {
  it('uses the median when the runs are within 15% of each other', () => {
    expect(medianIfRunsAgree([20, 22, 23])).toBe(22);
  });

  it('voids the result when the slowest run is more than 15% above the fastest', () => {
    expect(medianIfRunsAgree([20, 22, 24])).toBeNull();
  });
});

describe('transport graph on a full tower', () => {
  function bigTower() {
    const shafts: PlannedShaft[] = [];
    for (let index = 0; index < 12; index++) {
      const type = index < 8 ? 'standard' : index < 10 ? 'service' : 'express';
      const bottom = type === 'express' ? 1 : 2 + index;
      shafts.push({ type, x: 10 + index * 30, bottom, top: type === 'express' ? 90 : bottom + 28 });
    }
    const { state } = tower(100, shafts);
    for (let level = 2; level < 100; level += 3) addFlight(state, 'stairs', 4, level);
    return state;
  }

  it('rebuilds in under 50 ms by the median of three agreeing runs', () => {
    const state = bigTower();
    const graph = new TransportGraph(state);
    graph.rebuild(state);
    const result = timeUntilRunsAgree(() => graph.rebuild(state));
    expect(result).not.toBeNull();
    expect(result).toBeLessThan(50);
  });

  it('answers a neighbour lookup with the same array every time', () => {
    const graph = new TransportGraph(bigTower());
    const node = graph.nodeAtCell(2, 8);
    const id = node?.id ?? -1;
    expect(graph.neighbours(id, 'other')).toBe(graph.neighbours(id, 'other'));
  });
});
