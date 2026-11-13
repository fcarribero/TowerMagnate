import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import {
  PERSON_MODELS,
  PERSON_POSES,
  PERSON_TYPES,
  drawCalmPerson,
  modelsOfType,
  peopleGroup,
} from '../src/groups/people.mjs';
import { metrics } from '../src/metrics.mjs';
import { colorIndex } from '../src/palette.mjs';

const [{ sprites }] = drawGroups([peopleGroup]);
const byId = Object.fromEntries(sprites.map((sprite) => [sprite.id, sprite.canvas]));
const POSE_IDS = ['walk_01', 'walk_02', 'stand', 'idle_01', 'idle_02'];
const LAYERS = ['skin', 'hair', 'shirt'];
// Recolorable layers use only white and its cloud shade, so a runtime tint reads as the tint color.
const LAYER_COLORS = [colorIndex('white'), colorIndex('cloud')];

function countColor(canvas, index) {
  return canvas.pixels.filter((pixel) => pixel === index).length;
}

function filled(canvas) {
  return canvas.pixels.filter((pixel) => pixel !== 0).length;
}

function differentPixels(first, second) {
  return first.pixels.filter((pixel, index) => pixel !== second.pixels[index]).length;
}

describe('people group', () => {
  it('covers every person type from the brief', () => {
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
      'builder',
      'staff',
      'staffbag',
    ]);
    expect(PERSON_MODELS).toEqual(['man', 'woman']);
    expect(PERSON_POSES).toEqual(POSE_IDS);
  });

  it('draws one man and one woman with skin, hair and shirt layers in every pose', () => {
    for (const model of PERSON_MODELS) {
      for (const layer of LAYERS) {
        for (const pose of POSE_IDS) {
          expect(
            byId[`people/${layer}-${model}/${pose}`],
            `${layer}-${model} ${pose}`,
          ).toBeDefined();
        }
      }
    }
    for (const lower of ['trousers', 'skirt', 'gown']) {
      for (const pose of POSE_IDS) {
        expect(byId[`people/pants-${lower}/${pose}`], `${lower} ${pose}`).toBeDefined();
      }
    }
  });

  it('draws the fixed uniform layer of each type for the models that can wear it', () => {
    for (const type of PERSON_TYPES) {
      for (const model of PERSON_MODELS) {
        const allowed = modelsOfType(type).includes(model);
        for (const pose of POSE_IDS) {
          const id = `people/fixed-${type}-${model}/${pose}`;
          expect(byId[id] !== undefined, id).toBe(allowed);
        }
      }
    }
    expect(modelsOfType('maid')).toEqual(['woman']);
    expect(modelsOfType('groom')).toEqual(['man']);
  });

  it('draws nothing else', () => {
    const fixed = PERSON_TYPES.reduce((sum, type) => sum + modelsOfType(type).length, 0);
    const layers = (3 + 2 * LAYERS.length) * POSE_IDS.length;
    expect(sprites).toHaveLength(layers + fixed * POSE_IDS.length);
  });

  it('uses the person frame and every layer stays inside it', () => {
    const { frameWidth, frameHeight } = metrics.person;
    for (const { id, canvas } of sprites) {
      expect([canvas.width, canvas.height], id).toEqual([frameWidth, frameHeight]);
      expect(filled(canvas), id).toBeGreaterThan(0);
    }
  });

  it('keeps the feet on the bottom row of the lower body and the shoes in the fixed layer', () => {
    const { frameWidth, frameHeight } = metrics.person;
    for (const pose of ['walk_01', 'walk_02', 'stand']) {
      const bottom = (canvas) => canvas.pixels.subarray((frameHeight - 1) * frameWidth);
      expect(
        bottom(byId[`people/fixed-resident-man/${pose}`]).some((pixel) => pixel !== 0),
        pose,
      ).toBe(true);
      expect(
        bottom(byId[`people/pants-trousers/${pose}`]).some((pixel) => pixel !== 0),
        pose,
      ).toBe(false);
    }
  });

  it('draws recolorable layers with white and cloud only', () => {
    for (const { id, canvas } of sprites.filter(({ id }) => !id.startsWith('people/fixed-'))) {
      for (const pixel of canvas.pixels) {
        if (pixel !== 0) {
          expect(LAYER_COLORS, id).toContain(pixel);
        }
      }
    }
  });

  it('keeps skin and hair in separate regions', () => {
    for (const model of PERSON_MODELS) {
      for (const pose of POSE_IDS) {
        const skin = byId[`people/skin-${model}/${pose}`];
        const hair = byId[`people/hair-${model}/${pose}`];
        const overlap = skin.pixels.filter(
          (pixel, index) => pixel !== 0 && hair.pixels[index] !== 0,
        );
        expect(overlap.length, `${model} ${pose}`).toBe(0);
      }
    }
  });

  it('gives the woman longer hair than the man', () => {
    expect(filled(byId['people/hair-woman/stand'])).toBeGreaterThan(
      filled(byId['people/hair-man/stand']),
    );
  });

  it('makes the two walk frames differ', () => {
    const first = byId['people/pants-trousers/walk_01'];
    const second = byId['people/pants-trousers/walk_02'];
    expect(differentPixels(first, second)).toBeGreaterThan(3);
    expect(
      differentPixels(
        byId['people/fixed-resident-man/walk_01'],
        byId['people/fixed-resident-man/walk_02'],
      ),
    ).toBeGreaterThan(0);
  });

  it('lowers the head by one pixel in the second idle frame', () => {
    expect(
      differentPixels(byId['people/skin-man/idle_01'], byId['people/skin-man/idle_02']),
    ).toBeGreaterThan(0);
    expect(differentPixels(byId['people/skin-man/idle_01'], byId['people/skin-man/stand'])).toBe(0);
  });

  it('gives the bag carrier a black bag the plain crew does not have', () => {
    const ink = colorIndex('ink');
    for (const model of PERSON_MODELS) {
      for (const pose of ['walk_01', 'walk_02', 'stand']) {
        const plain = byId[`people/fixed-staff-${model}/${pose}`];
        const carrier = byId[`people/fixed-staffbag-${model}/${pose}`];
        expect(
          countColor(carrier, ink) - countColor(plain, ink),
          `${model} ${pose}`,
        ).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('keeps stress colors out of every people sprite', () => {
    const stress = [colorIndex('stress-pink'), colorIndex('stress-red')];
    for (const { id, canvas } of sprites) {
      for (const color of stress) {
        expect(countColor(canvas, color), id).toBe(0);
      }
    }
  });

  it('draws the bride and groom with every layer stacked', () => {
    for (const type of ['bride', 'groom']) {
      for (const pose of ['walk_01', 'walk_02', 'stand']) {
        const person = drawCalmPerson(type, pose);
        expect(filled(person), `${type} ${pose}`).toBeGreaterThan(30);
        expect(person.pixels.subarray(15 * 8).some((pixel) => pixel !== 0)).toBe(true);
      }
    }
  });
});
