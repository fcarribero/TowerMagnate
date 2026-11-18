import { describe, expect, it } from 'vitest';
import { COMFORT_AURA, LIBRARY_NOISE_KEEP, type TowerState } from '@tower-magnate/shared';
import { absorbNoise, buildComfortCells, calmAt } from './comfort-units';
import { addWithFade, emptyHeat, valueAt } from './heat';
import { cellStressPerMinute } from './lobbies';

function towerWith(units: Record<string, { type: string; level: number; x: number }>): TowerState {
  const heat = emptyHeat();
  addWithFade(heat.noise, 3, 0, 200, 10, 0);
  addWithFade(heat.dirt, 3, 0, 200, 2, 0);
  return {
    step: 6,
    nextId: 100,
    units: Object.fromEntries(Object.entries(units).map(([id, unit]) => [id, { id, ...unit }])),
    grid: { levels: {} },
    heat,
  } as unknown as TowerState;
}

describe('gardens, lounges and libraries', () => {
  it('halve the stress felt in their cells and fade back to full over their radius', () => {
    const tower = towerWith({ u1: { type: 'garden', level: 3, x: 50 } });
    const plain = towerWith({});
    const full = cellStressPerMinute(plain, 3, 55);
    expect(full).toBeGreaterThan(0);
    expect(cellStressPerMinute(tower, 3, 55)).toBeCloseTo(full * 0.5);
    // garden is 12 wide: columns 50 to 61; its calm reaches 8 more columns on each side
    const { cells } = COMFORT_AURA.garden as { cells: number };
    expect(calmAt(tower, 3, 62)).toBeCloseTo(0.5 + 0.5 * (1 / (cells + 1)));
    expect(calmAt(tower, 3, 61 + cells)).toBeLessThan(1);
    expect(calmAt(tower, 3, 62 + cells)).toBe(1);
    expect(calmAt(tower, 3, 49 - cells)).toBe(1);
    // other levels do not feel it
    expect(calmAt(tower, 4, 55)).toBe(1);
    expect(cellStressPerMinute(tower, 3, 150)).toBe(full);
  });

  it('take the lower factor where two of them overlap', () => {
    const tower = towerWith({
      u1: { type: 'garden', level: 3, x: 50 },
      u2: { type: 'lounge', level: 3, x: 64 },
    });
    expect(calmAt(tower, 3, 63)).toBeLessThan(
      calmAt(towerWith({ u1: { type: 'garden', level: 3, x: 50 } }), 3, 63),
    );
  });

  it('has a library take some noise out of its cells each minute', () => {
    const tower = towerWith({ u1: { type: 'library', level: 3, x: 50 } });
    const noise = tower.heat?.noise ?? {};
    absorbNoise(tower, noise);
    expect(valueAt(noise, 3, 55)).toBeCloseTo(10 * LIBRARY_NOISE_KEEP);
    expect(valueAt(noise, 3, 66)).toBeGreaterThan(10 * LIBRARY_NOISE_KEEP);
    expect(valueAt(noise, 3, 66)).toBeLessThan(10);
    expect(valueAt(noise, 3, 150)).toBe(10);
    // dirt is not touched
    expect(valueAt(tower.heat?.dirt ?? {}, 3, 55)).toBe(2);
  });

  it('does nothing in a tower with none of them', () => {
    const tower = towerWith({ u1: { type: 'office', level: 3, x: 50 } });
    const cells = buildComfortCells(tower);
    expect(cells.calm.size).toBe(0);
    expect(cells.noiseKeep.size).toBe(0);
    const noise = tower.heat?.noise ?? {};
    absorbNoise(tower, noise);
    expect(valueAt(noise, 3, 55)).toBe(10);
  });
});
