import type { TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { buildHeatData, HEAT_VIEW_MAX } from './heat-view';

function floor(x0: number, x1: number) {
  return { structure: [{ kind: 'floor', x0, x1 }], occupants: [] };
}

describe('heat view', () => {
  it('scales each cell with floor to a byte from 1 for none to 255 for the max or more', () => {
    const state = {
      step: 600,
      grid: { levels: { '2': floor(0, 3), '3': floor(1, 2) } },
      heat: {
        noise: { '2': [0, HEAT_VIEW_MAX.noise / 2, HEAT_VIEW_MAX.noise * 3, 0] },
        dirt: {},
        cars: {},
      },
    } as unknown as TowerState;
    const data = buildHeatData(state, 'noise');
    expect(data).toEqual({
      kind: 'noise',
      step: 600,
      max: 20,
      levels: { '2': [1, 128, 255, 1], '3': [0, 1, 1] },
    });
  });

  it('leaves out cells and levels with no floor', () => {
    const state = {
      step: 0,
      grid: { levels: { '1': floor(2, 3), '4': { structure: [], occupants: [] } } },
    } as unknown as TowerState;
    expect(buildHeatData(state, 'dirt').levels).toEqual({ '1': [0, 0, 1, 1] });
  });

  it('is empty for a tower with no floors', () => {
    const data = buildHeatData({ step: 0 } as TowerState, 'dirt');
    expect(data.levels).toEqual({});
  });
});
