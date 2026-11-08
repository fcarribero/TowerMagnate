import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { PERSON_TYPES, PERSON_VARIANTS, peopleGroup } from '../src/groups/people.mjs';
import { metrics } from '../src/metrics.mjs';
import { colorIndex } from '../src/palette.mjs';

const [{ sprites }] = drawGroups([peopleGroup]);
const byId = Object.fromEntries(sprites.map((sprite) => [sprite.id, sprite.canvas]));
const subjects = PERSON_TYPES.flatMap((type) =>
  PERSON_VARIANTS.map((variant) => `${type}-${variant}`),
);
const STRESS = [colorIndex('stress-pink'), colorIndex('stress-red')];
const SKINS = ['skin-light', 'skin-mid', 'skin-dark'].map(colorIndex);

function countColor(canvas, index) {
  return canvas.pixels.filter((pixel) => pixel === index).length;
}

function differentPixels(first, second) {
  return first.pixels.filter((pixel, index) => pixel !== second.pixels[index]).length;
}

describe('people group', () => {
  it('covers every person type from the brief with four variants each', () => {
    expect(PERSON_TYPES).toEqual([
      'worker',
      'resident',
      'guest',
      'customer',
      'maid',
      'security',
      'vip',
      'bride',
      'wedding-guest',
      'groom',
    ]);
    expect(subjects.length).toBeGreaterThanOrEqual(8);
    expect(PERSON_VARIANTS).toEqual(['a', 'b', 'c', 'd']);
  });

  it('draws two walk frames and a standing pose in calm, pink and red', () => {
    for (const subject of subjects) {
      for (const tint of ['', '-pink', '-red']) {
        expect(byId[`people/${subject}/walk${tint}_01`], subject).toBeDefined();
        expect(byId[`people/${subject}/walk${tint}_02`], subject).toBeDefined();
        expect(byId[`people/${subject}/stand${tint}`], subject).toBeDefined();
      }
    }
    expect(sprites).toHaveLength(subjects.length * 9);
  });

  it('uses the person frame and keeps the feet on the bottom row', () => {
    const { frameWidth, frameHeight } = metrics.person;
    for (const { id, canvas } of sprites) {
      expect([canvas.width, canvas.height], id).toEqual([frameWidth, frameHeight]);
      const bottomRow = canvas.pixels.subarray((frameHeight - 1) * frameWidth);
      expect(
        bottomRow.some((pixel) => pixel !== 0),
        id,
      ).toBe(true);
    }
  });

  it('makes the two walk frames differ', () => {
    for (const subject of subjects) {
      const first = byId[`people/${subject}/walk_01`];
      const second = byId[`people/${subject}/walk_02`];
      expect(differentPixels(first, second), subject).toBeGreaterThan(3);
    }
  });

  it('keeps stress colors off calm people', () => {
    for (const { id, canvas } of sprites.filter(({ id }) => !/-(pink|red)/.test(id))) {
      for (const stress of STRESS) {
        expect(countColor(canvas, stress), id).toBe(0);
      }
    }
  });

  it('tints most of the figure and keeps the skin, so the tint reads at 1x', () => {
    for (const subject of subjects) {
      const calm = byId[`people/${subject}/walk_01`];
      for (const [tint, color] of [
        ['pink', 'stress-pink'],
        ['red', 'stress-red'],
      ]) {
        const stressed = byId[`people/${subject}/walk-${tint}_01`];
        expect(countColor(stressed, colorIndex(color)), subject).toBeGreaterThanOrEqual(20);
        for (const skin of SKINS) {
          expect(countColor(stressed, skin), subject).toBe(countColor(calm, skin));
        }
      }
    }
  });

  it('gives each type at least two skin tones and two builds', () => {
    for (const type of PERSON_TYPES) {
      const stands = PERSON_VARIANTS.map((variant) => byId[`people/${type}-${variant}/stand`]);
      const skins = new Set(
        stands.map((canvas) => SKINS.find((skin) => countColor(canvas, skin) > 0)),
      );
      const heights = new Set(
        stands.map((canvas) => canvas.pixels.findIndex((pixel) => pixel !== 0)),
      );
      expect(skins.size, type).toBeGreaterThanOrEqual(2);
      expect(heights.size, type).toBeGreaterThanOrEqual(2);
    }
  });
});
