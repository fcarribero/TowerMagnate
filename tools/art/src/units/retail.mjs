import { placeOnFloor, shopSprites } from './storefront.mjs';

const WIDTH_TILES = 12;

const shell = {
  wall: 'cloud',
  wallLight: 'white',
  wallDark: 'silver',
  floor: ['silver', 'gray', 'slate'],
};

const garmentRack = [
  '.vvvvvvvvvv.',
  '.r.b.r.b.r..',
  '.r.b.r.b.r..',
  '.r.b.r.b.r..',
  '.r.b.r.b.r..',
  '....s.......',
  '....s.......',
  '....s.......',
  '....s.......',
  '...sss......',
];

const mannequin = ['.1.', '.1.', 'bbb', 'bbb', 'b.b', '.s.', '.s.', 'sss'];

const bookcase = [
  'oooooooooooooooo',
  'orbLyrbbLyrbLybo',
  'orbLyrbbLyrbLybo',
  'llllllllllllllll',
  'oLyrbbLrybLrbyLo',
  'oLyrbbLrybLrbyLo',
  'llllllllllllllll',
  'obyLrbyLrbyLrbyo',
  'obyLrbyLrbyLrbyo',
  'dddddddddddddddd',
  'd..............d',
  'd..............d',
];

const vegetableCrate = ['eLeLeLeLeL', 'LeLeLeLeLe', 'oooooooooo', 'ollllllllo', 'dddddddddd'];

const shelfUnit = [
  'vvvvvvvvvvvv',
  'vCeCLCyCeCLv',
  'vCeCLCyCeCLv',
  'vssssssssssv',
  'vyCeCLCyCeCv',
  'vyCeCLCyCeCv',
  'vggggggggggv',
  'g..........g',
  'g..........g',
];

const televisions = [
  'kkkkkkkkkkkk',
  'kbbbbkkccccs',
  'kbwbbkkcbbcs',
  'kbbbbkkccccs',
  'kkkkkkkkkkkk',
  '.ss......ss.',
  'gggggggggggg',
  's..........s',
  's..........s',
  's..........s',
  's..........s',
];

const computers = ['ssssss', 'sbbbbs', 'sbwbbs', 'ssssss', '..ss..', 'gggggg'];

const shopLooks = {
  'retail-shop': {
    shell,
    signColor: 'cloth-blue',
    textWidth: 24,
    awning: ['cloth-red', 'white'],
    lamps: [24, 72],
    customers: [[40, '2', 'L']],
    drawInterior(room) {
      placeOnFloor(room, 6, garmentRack);
      placeOnFloor(room, 24, mannequin);
      placeOnFloor(room, 52, garmentRack);
      placeOnFloor(room, 78, mannequin);
    },
  },
  'retail-shop-books': {
    shell: { ...shell, wall: 'concrete-light', wallLight: 'cloud', wallDark: 'concrete' },
    signColor: 'wood-dark',
    textWidth: 28,
    awning: ['leaf', 'cloud'],
    lamps: [24, 72],
    customers: [[44, '1', 'r']],
    drawInterior(room) {
      placeOnFloor(room, 4, bookcase);
      placeOnFloor(room, 76, bookcase);
    },
  },
  'retail-shop-grocery': {
    shell,
    signColor: 'leaf-dark',
    textWidth: 32,
    awning: ['dusk', 'white'],
    lamps: [24, 72],
    customers: [[42, '3', 'y']],
    drawInterior(room) {
      placeOnFloor(room, 4, shelfUnit);
      placeOnFloor(room, 40, vegetableCrate);
      placeOnFloor(room, 80, shelfUnit);
    },
  },
  'retail-shop-electronics': {
    shell: { ...shell, wall: 'silver', wallLight: 'cloud', wallDark: 'gray' },
    signColor: 'charcoal',
    textWidth: 36,
    awning: ['cloth-blue', 'silver'],
    lamps: [24, 72],
    customers: [[44, '2', 'b']],
    drawInterior(room) {
      placeOnFloor(room, 4, televisions);
      placeOnFloor(room, 40, computers);
      placeOnFloor(room, 80, televisions);
    },
  },
};

export const SHOP_TYPES = Object.keys(shopLooks);

export function retailSprites() {
  return SHOP_TYPES.flatMap((type) => shopSprites(type, WIDTH_TILES, shopLooks[type]));
}
