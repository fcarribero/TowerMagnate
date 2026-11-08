import { describe, expect, it } from 'vitest';
import type { Camera } from './camera';
import { levelAtCanvasY, rulerMarks } from './levelRuler';
import { levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT } from './metrics';

function cameraOnLevel(level: number, zoom: 1 | 2 | 3 | 4, levelsTall: number): Camera {
  return {
    zoom,
    left: 0,
    top: levelTop(levelToIndex(level)) * zoom,
    viewWidth: 800,
    viewHeight: levelsTall * FLOOR_HEIGHT * zoom,
  };
}

describe('rulerMarks', () => {
  it('labels every visible level from the top down', () => {
    const marks = rulerMarks(cameraOnLevel(12, 2, 3));
    expect(marks.map((mark) => mark.label)).toEqual(['12', '11', '10']);
    expect(marks.map((mark) => mark.top)).toEqual([0, 64, 128]);
    expect(marks.every((mark) => mark.height === 64)).toBe(true);
  });

  it('skips level 0 and names basements with S', () => {
    const marks = rulerMarks(cameraOnLevel(2, 1, 4));
    expect(marks.map((mark) => mark.label)).toEqual(['2', '1', 'S1', 'S2']);
  });

  it('includes a level that shows only partly', () => {
    const camera = { ...cameraOnLevel(12, 1, 2), top: levelTop(levelToIndex(12)) + 30 };
    const marks = rulerMarks(camera);
    expect(marks[0]).toMatchObject({ label: '12', top: -30 });
    expect(marks.at(-1)?.label).toBe('10');
  });
});

describe('levelAtCanvasY', () => {
  it('finds the level under a canvas point at any zoom', () => {
    const camera = cameraOnLevel(12, 3, 4);
    expect(levelAtCanvasY(camera, 0)).toBe(12);
    expect(levelAtCanvasY(camera, FLOOR_HEIGHT * 3 - 1)).toBe(12);
    expect(levelAtCanvasY(camera, FLOOR_HEIGHT * 3)).toBe(11);
  });

  it('jumps from level 1 to S1', () => {
    const camera = cameraOnLevel(1, 1, 2);
    expect(levelAtCanvasY(camera, FLOOR_HEIGHT)).toBe(-1);
  });

  it('is null above or below the world', () => {
    const camera: Camera = { zoom: 1, left: 0, top: -40, viewWidth: 100, viewHeight: 100 };
    expect(levelAtCanvasY(camera, 10)).toBeNull();
    expect(levelAtCanvasY(cameraOnLevel(-10, 1, 1), FLOOR_HEIGHT + 1)).toBeNull();
  });
});
