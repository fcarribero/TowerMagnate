import { describe, expect, it } from 'vitest';
import { colorIndex, colorRgba, colors } from '../src/palette.mjs';

describe('palette', () => {
  it('has the 32 tower slots and 8 obra slots, with transparent at index 0', () => {
    expect(colors).toHaveLength(40);
    expect(colors[32].id).toBe('obra-ink');
    expect(colors[0].id).toBe('clear');
    expect(colors[0].rgba).toEqual([0, 0, 0, 0]);
  });

  it('gives every opaque color a unique #rrggbb hex and every slot a unique id', () => {
    const opaque = colors.slice(1);
    for (const color of opaque) {
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(color.rgba[3]).toBe(255);
    }
    expect(new Set(opaque.map((color) => color.hex)).size).toBe(opaque.length);
    expect(new Set(colors.map((color) => color.id)).size).toBe(colors.length);
  });

  it('looks colors up by id or index', () => {
    expect(colorIndex('ink')).toBe(1);
    expect(colorRgba('ink')).toEqual([0x14, 0x12, 0x18, 255]);
    expect(colorRgba(1)).toEqual(colorRgba('ink'));
    expect(() => colorIndex('magenta')).toThrow(/Unknown palette color/);
    expect(() => colorRgba(99)).toThrow(/out of range/);
  });
});
