import type { QueuedCommand } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { fullSiteTower } from './commands/shaft-test-helpers';
import { step } from './step';

const buildStandardShaft: QueuedCommand = {
  id: 'c1',
  command: { type: 'buildShaft', shaftType: 'standard', x: 40, bottom: 1, top: 10 },
};
const badShaft: QueuedCommand = {
  id: 'c2',
  command: { type: 'buildShaft', shaftType: 'standard', x: 40, bottom: 1, top: 500 },
};

describe('transport graph in step', () => {
  it('rebuilds the graph when a build command succeeds', () => {
    const tower = fullSiteTower();
    const first = step(tower, [], 1);
    const built = step(first.state, [buildStandardShaft], 1, first.graph);
    expect(built.graph).not.toBe(first.graph);
    expect(built.graph.nodeAtCell(1, 42)).not.toBeNull();
  });

  it('keeps the same graph through steps that change nothing', () => {
    const first = step(fullSiteTower(), [], 1);
    expect(step(first.state, [], 20, first.graph).graph).toBe(first.graph);
  });

  it('keeps the graph of a returned state when no graph is passed', () => {
    const first = step(fullSiteTower(), [], 1);
    expect(step(first.state, [], 5).graph).toBe(first.graph);
  });

  it('builds a new graph for a state it did not return', () => {
    const first = step(fullSiteTower(), [], 1);
    expect(step(structuredClone(first.state), [], 1).graph).not.toBe(first.graph);
  });

  it('builds a new graph for a returned state whose shafts were changed in place', () => {
    const first = step(fullSiteTower(), [buildStandardShaft], 1);
    for (const shaft of Object.values(first.state.shafts)) {
      Reflect.deleteProperty(first.state.shafts, shaft.id);
    }
    const next = step(first.state, [], 1);
    expect(next.graph).not.toBe(first.graph);
    expect(next.graph.nodeAtCell(1, 42)).toBeNull();
  });

  it('builds a new graph for a returned state whose rows were changed in place', () => {
    const first = step(fullSiteTower(), [buildStandardShaft], 1);
    const row = first.state.grid.levels[1];
    if (row) row.occupants = [];
    expect(step(first.state, [], 1).graph).not.toBe(first.graph);
  });

  it('keeps the graph of a returned state whose shaft stops are listed the same way', () => {
    const first = step(fullSiteTower(), [buildStandardShaft], 1);
    for (const shaft of Object.values(first.state.shafts)) shaft.stops = [...shaft.stops];
    expect(step(first.state, [], 1).graph).toBe(first.graph);
  });

  it('builds a new graph for a returned state whose shaft lost a stop', () => {
    const first = step(fullSiteTower(), [buildStandardShaft], 1);
    for (const shaft of Object.values(first.state.shafts)) shaft.stops = shaft.stops.slice(1);
    expect(step(first.state, [], 1).graph).not.toBe(first.graph);
  });

  it('keeps the graph when the command is rejected', () => {
    const first = step(fullSiteTower(), [], 1);
    const result = step(first.state, [badShaft], 1, first.graph);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.graph).toBe(first.graph);
  });
});
