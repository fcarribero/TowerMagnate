import { cathedralSprites } from '../units/cathedral.mjs';
import { condoSprites } from '../units/condo.mjs';
import { doubleRoomSprites, singleRoomSprites, suiteSprites } from '../units/hotel.mjs';
import { housekeepingSprites } from '../units/housekeeping.mjs';
import { officeSprites } from '../units/office.mjs';

export const unitsGroup = {
  name: 'units',
  draw() {
    return [
      ...officeSprites(),
      ...condoSprites(),
      ...singleRoomSprites(),
      ...doubleRoomSprites(),
      ...suiteSprites(),
      ...housekeepingSprites(),
      ...cathedralSprites(),
    ];
  },
};
