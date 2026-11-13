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

  it('fits the whole tape and its lettering inside the sprite, nothing cut at the ends', () => {
    for (const id of ['effects/for-rent/sticker', 'effects/for-sale/sticker']) {
      const tape = byId[id];
      for (let x = 0; x < tape.width; x++) {
        expect(tape.get(x, 0), `${id} top ${x}`).toBe(0);
        expect(tape.get(x, tape.height - 1), `${id} bottom ${x}`).toBe(0);
      }
      for (let y = 0; y < tape.height; y++) {
        expect(tape.get(0, y), `${id} left ${y}`).toBe(0);
        expect(tape.get(tape.width - 1, y), `${id} right ${y}`).toBe(0);
      }
      let first = tape.width;
      let last = -1;
      let whiteFirst = tape.width;
      let whiteLast = -1;
      for (let y = 0; y < tape.height; y++) {
        for (let x = 0; x < tape.width; x++) {
          if (tape.get(x, y) === 0) continue;
          first = Math.min(first, x);
          last = Math.max(last, x);
          if (tape.get(x, y) === colorIndex('white')) {
            whiteFirst = Math.min(whiteFirst, x);
            whiteLast = Math.max(whiteLast, x);
          }
        }
      }
      // The lettering is 94 px long, drawn on a slant, and the tape runs past it at both ends.
      expect(whiteLast - whiteFirst, id).toBeGreaterThan(85);
      expect(whiteFirst - first, `${id} red before the first letter`).toBeGreaterThanOrEqual(4);
      expect(last - whiteLast, `${id} red after the last letter`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('garbage pile', () => {
  it('draws ten piles that grow, sit on the floor and fit the narrowest venue', () => {
    let previous = 0;
    for (let bags = 1; bags <= 10; bags++) {
      const pile = byId[`effects/garbage/pile_${bags}`];
      expect(pile, `pile_${bags}`).toBeDefined();
      expect(pile.width).toBeLessThanOrEqual(32);
      const bottomRow = pile.pixels.subarray((pile.height - 1) * pile.width);
      expect(bottomRow.some((index) => index !== 0)).toBe(true);
      const filled = pile.pixels.filter((index) => index !== 0).length;
      expect(filled).toBeGreaterThan(previous);
      previous = filled;
    }
  });
});
