import { describe, expect, it } from 'vitest';
import { bandOf, HEAT_BANDS, heatColor, heatRuns } from './heatLayer';

describe('heat layer plan', () => {
  it('puts a cell byte in a band: none with no floor, green with no heat, red at 255', () => {
    expect(bandOf(0)).toBe(0);
    expect(bandOf(1)).toBe(1);
    expect(heatColor(bandOf(1))).toBe(0x7ec850);
    expect(bandOf(255)).toBe(HEAT_BANDS);
  });

  it('draws a clean cell with floor as a green run', () => {
    const runs = heatRuns({ kind: 'dirt', step: 0, max: 5, levels: { '2': [0, 1, 1, 0] } });
    expect(runs).toEqual([{ level: 2, from: 1, to: 2, band: 1 }]);
  });

  it('runs from green through yellow to red', () => {
    expect(heatColor(1)).toBe(0x7ec850);
    expect(heatColor(HEAT_BANDS)).toBe(0xb0353a);
  });

  it('merges neighbouring cells of one band into a run and skips empty cells', () => {
    const row = new Array<number>(20).fill(0);
    row.fill(255, 2, 5);
    row[5] = 100;
    row[10] = 255;
    const runs = heatRuns({ kind: 'noise', step: 0, max: 20, levels: { '3': row } });
    expect(runs).toEqual([
      { level: 3, from: 2, to: 4, band: HEAT_BANDS },
      { level: 3, from: 5, to: 5, band: bandOf(100) },
      { level: 3, from: 10, to: 10, band: HEAT_BANDS },
    ]);
  });
});
