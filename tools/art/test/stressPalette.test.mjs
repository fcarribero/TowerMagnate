import { describe, expect, it } from 'vitest';
import { colors } from '../src/palette.mjs';
import { STRESS_BANDS, stressPaletteSource } from '../src/stressPalette.mjs';

function channels(id) {
  const { hex } = colors.find((color) => color.id === id);
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function distance(firstId, secondId) {
  const [first, second] = [channels(firstId), channels(secondId)];
  return Math.hypot(...first.map((value, index) => value - second[index]));
}

describe('stress palette', () => {
  it('has the three bands of the stress spec at 90 and 180 steps', () => {
    expect(STRESS_BANDS.map((band) => [band.name, band.color, band.minSteps])).toEqual([
      ['normal', 'ink', 0],
      ['high', 'stress-pink', 90],
      ['very-high', 'stress-red', 180],
    ]);
  });

  it('keeps the three colors far apart', () => {
    expect(distance('stress-pink', 'stress-red')).toBeGreaterThan(100);
    expect(distance('stress-pink', 'ink')).toBeGreaterThan(200);
    expect(distance('stress-red', 'ink')).toBeGreaterThan(100);
  });

  it('writes the hex values for the web client', () => {
    const source = stressPaletteSource();
    expect(source).toContain("export const STRESS_INK = '#141218';");
    expect(source).toContain("export const STRESS_PINK = '#f07aa8';");
    expect(source).toContain("export const STRESS_RED = '#d81e2a';");
    expect(source).toContain("minSteps: 180, spriteSuffix: '-red'");
  });
});
