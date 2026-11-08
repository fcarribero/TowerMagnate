import { cathedralSprites } from '../units/cathedral.mjs';
import { condoSprites } from '../units/condo.mjs';
import { doubleRoomSprites, singleRoomSprites, suiteSprites } from '../units/hotel.mjs';
import { fastFoodSprites, restaurantSprites } from '../units/food.mjs';
import { housekeepingSprites } from '../units/housekeeping.mjs';
import { officeSprites } from '../units/office.mjs';
import { retailSprites } from '../units/retail.mjs';
import {
  medicalCenterSprites,
  parkingRampSprites,
  parkingSpaceSprites,
  recyclingCenterSprites,
  securitySprites,
  subwayStationSprites,
} from '../units/services.mjs';

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
      ...fastFoodSprites(),
      ...restaurantSprites(),
      ...retailSprites(),
      ...securitySprites(),
      ...medicalCenterSprites(),
      ...parkingRampSprites(),
      ...parkingSpaceSprites(),
      ...recyclingCenterSprites(),
      ...subwayStationSprites(),
      ...cathedralSprites(),
    ];
  },
};
