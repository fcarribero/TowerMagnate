import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { unitsGroup } from '../src/groups/units.mjs';
import { metrics } from '../src/metrics.mjs';
import { colorIndex } from '../src/palette.mjs';

const [{ sprites }] = drawGroups([unitsGroup]);
const byId = Object.fromEntries(sprites.map((sprite) => [sprite.id, sprite.canvas]));
const count = (canvas, color) =>
  canvas.pixels.filter((index) => index === colorIndex(color)).length;

describe('room depth layers', () => {
  it('splits an office into a back layer and a frame of the same size', () => {
    const whole = byId['units/office/occupied_day'];
    const back = byId['units/office/back-occupied_day'];
    const front = byId['units/office/front-occupied_day'];
    expect([back.width, back.height]).toEqual([whole.width, whole.height]);
    expect([front.width, front.height]).toEqual([whole.width, whole.height]);
  });

  it('keeps the frame out of the back layer and the window glass out of both', () => {
    const back = byId['units/office/back-occupied_day'];
    const front = byId['units/office/front-occupied_day'];
    expect(back.get(0, 10)).toBe(0);
    expect(back.get(back.width - 1, 10)).toBe(0);
    expect(front.get(0, 10)).toBe(colorIndex('ink'));
    expect(count(back, 'glass')).toBe(0);
    expect(count(front, 'glass')).toBe(0);
  });

  it('draws the slab under the floor in the frame only', () => {
    const back = byId['units/office/back-empty_day'];
    const front = byId['units/office/front-empty_day'];
    const slabRow = metrics.floorHeight - 1;
    expect(back.get(10, slabRow)).toBe(0);
    expect(front.get(10, slabRow)).not.toBe(0);
  });

  it('adds wall and floor swatches for each unit type, day and night', () => {
    expect(byId['units/office/side_day'].width).toBe(1);
    expect(byId['units/office/floor_day'].height).toBe(3);
    expect(byId['units/office/ceiling_night']).toBeDefined();
  });
});
