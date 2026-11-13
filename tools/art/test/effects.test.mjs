import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { colorIndex } from '../src/palette.mjs';
import { effectsGroup } from '../src/groups/effects.mjs';
import { metrics } from '../src/metrics.mjs';

const [{ sprites }] = drawGroups([effectsGroup]);
const byId = Object.fromEntries(sprites.map((sprite) => [sprite.id, sprite.canvas]));
const ids = Object.keys(byId);

function framesOf(animation) {
  return ids.filter((id) => id.startsWith(`${animation}_`));
}

function isBlank(canvas) {
  return canvas.pixels.every((index) => index === 0);
}

describe('effects group', () => {
  it('draws every animated effect with 3 or more frames', () => {
    const animations = [
      'effects/fire/flame',
      'effects/fire/front',
      'effects/smoke/puff',
      'effects/bomb/blast',
      'effects/roach/crawl',
      'effects/helicopter/fly',
      'effects/helicopter/water',
      'effects/santa/sleigh',
      'effects/treasure/chest',
    ];
    for (const animation of animations) {
      expect(framesOf(animation).length, animation).toBeGreaterThanOrEqual(3);
    }
  });

  it('draws the static effects', () => {
    expect(ids).toEqual(
      expect.arrayContaining([
        'effects/bomb/rubble_a',
        'effects/bomb/rubble_b',
        'effects/burnt/overlay',
      ]),
    );
  });

  it('draws no empty sprite and keeps frames of one animation the same size', () => {
    for (const id of ids) {
      expect(isBlank(byId[id]), id).toBe(false);
    }
    for (const animation of new Set(ids.map((id) => id.replace(/_\d{2}$/, '')))) {
      const sizes = framesOf(animation).map((id) => `${byId[id].width}x${byId[id].height}`);
      expect(new Set(sizes).size, animation).toBeLessThanOrEqual(1);
    }
  });

  it('makes fire, smoke, rubble and the burnt overlay fit one tile column', () => {
    for (const id of ids.filter((name) => /fire|smoke|rubble|burnt/.test(name))) {
      expect(byId[id].width, id).toBe(metrics.tileWidth);
    }
    expect(byId['effects/burnt/overlay'].height).toBe(metrics.floorHeight);
  });

  it('changes pixels between the frames of an animation', () => {
    for (const animation of ['effects/fire/flame', 'effects/roach/crawl', 'effects/santa/sleigh']) {
      const [first, second] = framesOf(animation).map((id) => byId[id].pixels.join());
      expect(first, animation).not.toBe(second);
    }
  });

  it('lights flames from the bottom with the fire core colors', () => {
    const flame = byId['effects/fire/flame_01'];
    const bottom = flame.height - 1;
    expect(flame.get(3, bottom)).toBe(colorIndex('lamp-glow'));
    expect(flame.get(3, 0)).toBe(0);
  });

  it('keeps the burnt overlay open so the sprite below shows through', () => {
    const overlay = byId['effects/burnt/overlay'];
    const clear = overlay.pixels.filter((index) => index === 0).length;
    expect(clear).toBeGreaterThan(overlay.pixels.length / 2);
    expect(clear).toBeLessThan(overlay.pixels.length);
  });
});

describe('availability tape', () => {
  it('draws a red tape with white lettering at twice the unit pixel density', () => {
    for (const id of ['effects/for-rent/sticker', 'effects/for-sale/sticker']) {
      const tape = byId[id];
      expect(tape, id).toBeDefined();
      const count = (color) => tape.pixels.filter((index) => index === colorIndex(color)).length;
      expect(count('cloth-red')).toBeGreaterThan(count('white'));
      expect(count('white')).toBeGreaterThan(40);
      expect(tape.get(0, 0)).toBe(0);
    }
    expect(byId['effects/for-rent/sticker'].pixels).not.toEqual(
      byId['effects/for-sale/sticker'].pixels,
    );
  });
});
