import { condoSprites } from '../units/condo.mjs';
import { officeSprites } from '../units/office.mjs';

export const unitsGroup = {
  name: 'units',
  draw() {
    return [...officeSprites(), ...condoSprites()];
  },
};
