import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { groups } from '../src/groups/index.mjs';
import { PERSON_TYPES, PERSON_VARIANTS } from '../src/groups/people.mjs';
import { colorIndex } from '../src/palette.mjs';
import { drawTintVariantSheet } from '../src/preview.mjs';

const sprites = Object.fromEntries(
  drawGroups(groups).flatMap((group) => group.sprites.map(({ id, canvas }) => [id, canvas])),
);
const sheet = drawTintVariantSheet(sprites, PERSON_TYPES, PERSON_VARIANTS);

function countColor(index) {
  return sheet.pixels.filter((pixel) => pixel === index).length;
}

describe('tint variant sheet', () => {
  it('shows every variant in pink and red on both skies', () => {
    const people = PERSON_TYPES.length * PERSON_VARIANTS.length * 2;
    expect(countColor(colorIndex('stress-pink'))).toBeGreaterThanOrEqual(people);
    expect(countColor(colorIndex('stress-red'))).toBeGreaterThanOrEqual(people);
  });

  it('has no transparent pixels', () => {
    expect(sheet.pixels.every((pixel) => pixel !== 0)).toBe(true);
  });
});
