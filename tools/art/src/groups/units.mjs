import { cathedralSprites } from '../units/cathedral.mjs';
import { condoSprites } from '../units/condo.mjs';
import {
  SUITE_WINDOWS,
  doubleRoomSprites,
  singleRoomSprites,
  suiteSprites,
} from '../units/hotel.mjs';
import { PARTY_WINDOWS, cinemaSprites, partyHallSprites } from '../units/entertainment.mjs';
import { fastFoodSprites, restaurantSprites } from '../units/food.mjs';
import { HOUSEKEEPING_WINDOWS, housekeepingSprites } from '../units/housekeeping.mjs';
import { officeSprites } from '../units/office.mjs';
import { retailSprites } from '../units/retail.mjs';
import {
  MEDICAL_WINDOWS,
  SECURITY_WINDOWS,
  medicalCenterSprites,
  parkingRampSprites,
  parkingSpaceSprites,
  recyclingCenterSprites,
  securitySprites,
  subwayStationSprites,
} from '../units/services.mjs';

// Units with windows that can also be built underground, and the art subjects they are drawn
// with: housekeeping (also the cleaning room, the obrador and the library), security, the
// medical center, the suite (the lounge) and the party hall. Below ground they have no windows.
const UNDERGROUND_SUBJECTS = {
  housekeeping: HOUSEKEEPING_WINDOWS,
  security: SECURITY_WINDOWS,
  'medical-center': MEDICAL_WINDOWS,
  suite: SUITE_WINDOWS,
  'party-hall': PARTY_WINDOWS,
};

// The underground copy of every day and night sprite of those subjects, named
// `units/<subject>/<state>-underground_<time>`: each window and its frame walled over in the
// color of the wall beside it, so a dark or closed sprite stays as dark.
function undergroundSprites(sprites) {
  const copies = [];
  for (const { id, canvas } of sprites) {
    const match = /^units\/([a-z-]+)\/([a-z]+)_(day|night)$/.exec(id);
    const windows = match && UNDERGROUND_SUBJECTS[match[1]];
    if (!windows) continue;
    const walled = canvas.clone();
    for (const { left, top, width, height } of windows) {
      const wall = canvas.get(left - 3, top + Math.floor(height / 2));
      walled.fillRect(left - 1, top - 1, width + 2, height + 2, wall);
    }
    copies.push({ id: `units/${match[1]}/${match[2]}-underground_${match[3]}`, canvas: walled });
  }
  return copies;
}

export const unitsGroup = {
  name: 'units',
  draw() {
    const sprites = [
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
      ...cinemaSprites(),
      ...partyHallSprites(),
    ];
    return [...sprites, ...undergroundSprites(sprites)];
  },
};
