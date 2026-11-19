import { describe, expect, it } from 'vitest';
import { drawGroups } from '../src/build.mjs';
import { condoGroup } from '../src/groups/condo.mjs';
import { hotelGroup } from '../src/groups/hotel.mjs';
import { cleaningGroup } from '../src/groups/cleaning.mjs';
import { fastFoodGroup } from '../src/groups/fast-food.mjs';
import { housekeepingGroup } from '../src/groups/housekeeping.mjs';
import { officeGroup } from '../src/groups/office.mjs';
import { colorIndex } from '../src/palette.mjs';

// People walk into rooms as people; no interior prop may have a person drawn into it.
const SKIN = ['skin-light', 'skin-mid', 'skin-dark'].map(colorIndex);

describe('interior props', () => {
  it('never draw a person', () => {
    for (const { sprites } of drawGroups([
      officeGroup,
      condoGroup,
      hotelGroup,
      housekeepingGroup,
      cleaningGroup,
      fastFoodGroup,
    ])) {
      for (const { id, canvas } of sprites) {
        expect(
          canvas.pixels.some((index) => SKIN.includes(index)),
          id,
        ).toBe(false);
      }
    }
  });
});
