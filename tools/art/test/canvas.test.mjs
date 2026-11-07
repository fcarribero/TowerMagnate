import { describe, expect, it } from 'vitest';
import { PixelCanvas } from '../src/canvas.mjs';
import { colorIndex, colorRgba } from '../src/palette.mjs';

describe('PixelCanvas', () => {
  it('starts clear and draws rectangles by color id', () => {
    const canvas = new PixelCanvas(4, 3);
    expect(canvas.get(0, 0)).toBe(0);
    canvas.fillRect(1, 1, 2, 2, 'wood');
    expect(canvas.get(1, 1)).toBe(colorIndex('wood'));
    expect(canvas.get(2, 2)).toBe(colorIndex('wood'));
    expect(canvas.get(0, 1)).toBe(0);
  });

  it('ignores pixels outside the canvas', () => {
    const canvas = new PixelCanvas(2, 2);
    canvas.fillRect(-1, -1, 5, 5, 'ink');
    expect([...canvas.pixels]).toEqual([1, 1, 1, 1]);
    expect(canvas.get(9, 9)).toBe(0);
  });

  it('rejects colors outside the palette', () => {
    const canvas = new PixelCanvas(2, 2);
    expect(() => canvas.set(0, 0, 'magenta')).toThrow(/Unknown palette color/);
    expect(() => canvas.set(0, 0, 40)).toThrow(/Not a palette color/);
  });

  it('strokes only the border with strokeRect', () => {
    const canvas = new PixelCanvas(3, 3);
    canvas.strokeRect(0, 0, 3, 3, 'ink');
    expect(canvas.get(1, 1)).toBe(0);
    expect(canvas.get(2, 1)).toBe(colorIndex('ink'));
  });

  it('draws a pixel map through its legend and skips dots', () => {
    const canvas = new PixelCanvas(3, 2);
    canvas.drawMap(0, 0, ['a.b', 'bb.'], { a: 'ink', b: 'lamp' });
    expect([...canvas.pixels]).toEqual([1, 0, 21, 21, 21, 0]);
  });

  it('keeps the destination where a stamped source is clear', () => {
    const base = new PixelCanvas(2, 1);
    base.fillRect(0, 0, 2, 1, 'sky');
    const top = new PixelCanvas(2, 1);
    top.set(1, 0, 'ink');
    base.stamp(top, 0, 0);
    expect([...base.pixels]).toEqual([colorIndex('sky'), colorIndex('ink')]);
  });

  it('recolors into a new canvas and leaves the original alone', () => {
    const canvas = new PixelCanvas(2, 1);
    canvas.set(0, 0, 'cloth-blue');
    canvas.set(1, 0, 'skin-mid');
    const stressed = canvas.recolor({ 'cloth-blue': 'stress-red' });
    expect(stressed.get(0, 0)).toBe(colorIndex('stress-red'));
    expect(stressed.get(1, 0)).toBe(colorIndex('skin-mid'));
    expect(canvas.get(0, 0)).toBe(colorIndex('cloth-blue'));
  });

  it('expands indices to palette colors in toRgba', () => {
    const canvas = new PixelCanvas(2, 1);
    canvas.set(1, 0, 'lamp');
    expect([...canvas.toRgba()]).toEqual([0, 0, 0, 0, ...colorRgba('lamp')]);
  });
});
