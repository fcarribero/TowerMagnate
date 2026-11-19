import type { TowerState } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { buildHeatData, HEAT_VIEW_MAX } from './heat-view';

describe('heat view', () => {
  it('scales each cell to a byte and leaves out levels with no heat', () => {
    const state = {
      step: 600,
      heat: {
        noise: { '2': [0, HEAT_VIEW_MAX.noise / 2, HEAT_VIEW_MAX.noise * 3], '3': [0, 0, 0] },
        dirt: {},
        cars: {},
      },
    } as unknown as TowerState;
    const data = buildHeatData(state, 'noise');
    expect(data).toEqual({ kind: 'noise', step: 600, max: 20, levels: { '2': [0, 128, 255] } });
  });

  it('is empty for a tower with no heat yet', () => {
    const data = buildHeatData({ step: 0 } as TowerState, 'dirt');
    expect(data.levels).toEqual({});
  });
});
