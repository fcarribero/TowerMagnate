import { legend, placeOnFloor, shopSprites } from './storefront.mjs';

const shell = {
  wall: 'cloud',
  wallLight: 'white',
  wallDark: 'silver',
  floor: ['silver', 'gray', 'slate'],
};

const menuBoard = [
  'kkkkkkkkkkkkkkkkkk',
  'kcccccccccccccccck',
  'kcrrcwwwwcyyycwwck',
  'kcccccccccccccccck',
  'kcrrcwwwwcyyycwwck',
  'kcccccccccccccccck',
  'kcrrcwwwwcyyycwwck',
  'kkkkkkkkkkkkkkkkkk',
];

const counter = [
  'llllllllllllllllllllllllllllllllllllllllllllllllllllllllllll',
  'oooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo',
  'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
  'rwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrwrw',
  'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
  'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
  'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
];

const register = ['.ggg.', 'gwwwg', 'gkkkg', 'ggggg'];
const fryer = ['vvvvv', 'vsssv', 'vgggv', 'sssss'];

const stoolTable = [
  'ooooooooooo',
  'ddddddddddd',
  '..d.....d..',
  '..d.....d..',
  '..d.....d..',
  '..d.....d..',
  'rrr.....rrr',
  '.s.......s.',
  '.s.......s.',
  'kkk.....kkk',
];

const fastFoodLook = {
  shell,
  signColor: 'cloth-red',
  textWidth: 40,
  awning: ['cloth-red', 'white'],
  lamps: [30, 64, 98],
  customers: [
    [12, '1', 'b'],
    [26, '2', 'L'],
    [40, '3', 'y'],
    [96, '2', 'b'],
  ],
  drawInterior(room) {
    room.drawMap(8, 13, menuBoard, legend);
    room.drawMap(30, 13, menuBoard, legend);
    room.drawMap(52, 13, menuBoard, legend);
    placeOnFloor(room, 8, counter);
    placeOnFloor(room, 36, register);
    placeOnFloor(room, 50, fryer);
    placeOnFloor(room, 90, stoolTable);
  },
};

const tableSet = [
  'wwwwwwwwwwww',
  'rwrwrwrwrwrw',
  '.wwwwwwwwww.',
  '....dddd....',
  '....dddd....',
  '....dddd....',
  '....dddd....',
  '....dddd....',
  '...kkkkkk...',
];

const candle = ['.y.', '.y.', 'ggg'];
const chairFacingRight = ['o...', 'o...', 'oooo', 'd..d', 'd..d'];
const chairFacingLeft = ['...o', '...o', 'oooo', 'd..d', 'd..d'];
const plant = ['.L.L.', 'LDLLD', '.LDL.', 'L.D.L', '..D..', '.lol.', '.ooo.', '.ddd.'];
const painting = ['kkkkkkkk', 'kbbbLLLk', 'kbbLLLLk', 'kssssssk', 'kkkkkkkk'];

const TABLE_LEFTS = [14, 62, 110, 158];

const restaurantLook = {
  shell: { ...shell, wall: 'concrete-light', wallLight: 'cloud', wallDark: 'concrete' },
  signColor: 'wood-dark',
  textWidth: 56,
  awning: ['wood-dark', 'cloth-red'],
  lamps: [38, 86, 134, 182],
  customers: [
    [40, '1', 'r'],
    [88, '3', 'b'],
    [136, '2', 'L'],
  ],
  drawInterior(room) {
    room.drawMap(40, 14, painting, legend);
    room.drawMap(136, 14, painting, legend);
    placeOnFloor(room, 4, plant);
    placeOnFloor(room, 182, plant);
    TABLE_LEFTS.forEach((left) => {
      placeOnFloor(room, left, tableSet);
      room.drawMap(left + 5, 17, candle, legend);
      placeOnFloor(room, left - 4, chairFacingRight);
      placeOnFloor(room, left + 12, chairFacingLeft);
    });
  },
};

export function fastFoodSprites() {
  return shopSprites('fast-food', 16, fastFoodLook);
}

export function restaurantSprites() {
  return shopSprites('restaurant', 24, restaurantLook);
}
