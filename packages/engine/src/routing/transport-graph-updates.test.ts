import { UNIT_CATALOG, type Command, type Level, type TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { defaultSchedule } from '../commands/shafts';
import { accept } from '../commands/shaft-test-helpers';
import { step } from '../step';
import {
  addFlight,
  buildTower,
  hundredFloorTower,
  medianRunMillis,
  plainTowerPlan,
} from '../testing';
import { TransportGraph, type UserClass } from './transport-graph';

const SHAFT_X = 100;
const column = SHAFT_X + Math.floor(UNIT_CATALOG['standard-elevator'].width / 2);

function towerWithShaft(): TowerState {
  const plan = plainTowerPlan(6, 0, 374);
  plan.shafts = [{ type: 'standard', x: SHAFT_X, bottom: 1, top: 5 }];
  return buildTower(plan).state;
}

function graphAfter(state: TowerState, command: Command) {
  const { state: next, results, graph } = step(state, [{ id: 'c1', command }], 0);
  expect(results[0]?.ok).toBe(true);
  return { state: next, graph };
}

function setStops(state: TowerState, stops: Level[]): Command {
  const shaft = state.shafts.s1;
  if (!shaft) throw new Error('No shaft');
  return {
    type: 'configureShaft',
    shaftId: shaft.id,
    stops,
    carHomes: shaft.cars.map(() => stops[0] as Level),
    schedule: defaultSchedule(),
  };
}

function kindsAt(graph: TransportGraph, level: Level, x: number, userClass: UserClass = 'other') {
  const node = graph.nodeAtCell(level, x);
  if (!node) return null;
  return graph
    .neighbours(node.id, userClass)
    .map((link) => `${graph.node(link.to).level}:${link.kind}`)
    .sort();
}

describe('transport graph after demolish', () => {
  it('drops the neighbours of a demolished stair', () => {
    const state = towerWithShaft();
    const id = addFlight(state, 'stairs', 40, 2);
    expect(kindsAt(new TransportGraph(state), 2, 44)).toEqual(['3:stairs']);
    const { graph } = graphAfter(state, { type: 'demolish', target: { kind: 'transport', id } });
    expect(graph.nodeAtCell(2, 44)).toBeNull();
    expect(graph.nodeAtCell(3, 44)).toBeNull();
  });

  it('drops the neighbours of a demolished escalator and keeps the stair beside it', () => {
    const state = towerWithShaft();
    const escalator = addFlight(state, 'escalator', 40, 2);
    addFlight(state, 'stairs', 40, 3);
    expect(kindsAt(new TransportGraph(state), 3, 44)).toEqual(['2:escalator', '4:stairs']);
    const { graph } = graphAfter(state, {
      type: 'demolish',
      target: { kind: 'transport', id: escalator },
    });
    expect(kindsAt(graph, 3, 44)).toEqual(['4:stairs']);
    expect(kindsAt(graph, 2, 44)).toBeNull();
  });

  it('drops every stop of a demolished shaft', () => {
    const state = towerWithShaft();
    expect(kindsAt(new TransportGraph(state), 1, column)).toHaveLength(4);
    const { graph } = graphAfter(state, { type: 'demolish', target: { kind: 'shaft', id: 's1' } });
    expect(graph.nodeAtCell(1, column)).toBeNull();
    expect(graph.nodeAtCell(3, column)).toBeNull();
  });
});

describe('transport graph after stop changes', () => {
  it('removes a stop switched off and brings it back when switched on', () => {
    const state = towerWithShaft();
    const off = graphAfter(state, setStops(state, [1, 3, 4, 5]));
    expect(off.graph.nodeAtCell(2, column)).toBeNull();
    expect(kindsAt(off.graph, 1, column)).toEqual(['3:standard', '4:standard', '5:standard']);

    const on = graphAfter(off.state, setStops(off.state, [1, 2, 3, 4, 5]));
    expect(kindsAt(on.graph, 1, column)).toEqual([
      '2:standard',
      '3:standard',
      '4:standard',
      '5:standard',
    ]);
  });

  it('keeps two stops linked and leaves a single stop without links', () => {
    const state = towerWithShaft();
    const two = graphAfter(state, setStops(state, [2, 5]));
    expect(kindsAt(two.graph, 2, column)).toEqual(['5:standard']);
    expect(kindsAt(two.graph, 5, column)).toEqual(['2:standard']);

    const one = graphAfter(state, setStops(state, [3]));
    expect(kindsAt(one.graph, 3, column)).toEqual([]);
  });

  it('uses the shaft stops when a graph is built from state', () => {
    const state = towerWithShaft();
    const configured = accept(state, setStops(state, [1, 5])).state;
    const graph = new TransportGraph(configured);
    expect(kindsAt(graph, 1, column)).toEqual(['5:standard']);
  });
});

describe('transport graph rebuild time', () => {
  it('rebuilds the 100-floor tower in under 50 ms (median of 3)', () => {
    const state = hundredFloorTower();
    const graph = new TransportGraph(state);
    expect(medianRunMillis(() => graph.rebuild(state))).toBeLessThan(50);
  });
});
