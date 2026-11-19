import type { InteriorKind, InteriorSpec } from './types';

/**
 * Hotel rooms: the single room, the double room and the suite. Their props are drawn by
 * tools/art/src/groups/hotel.mjs and shared by the three. Unlike offices and condos, every room
 * of a type looks the same: the type has one fixed seed (`fixedSeed`), picked in the sprite lab.
 */

export type HotelState =
  'empty' | 'vacant' | 'closed' | 'occupied' | 'sleeping' | 'dirty' | 'infested';

const BUSY = ['busy'] as const;
/** Luggage is out only while a guest is staying. */
const NO_GUEST = ['vacant', 'dirty', 'infested'] as const;
/** Used towels are on the floor only after checkout. */
const NOT_DIRTY = ['vacant', 'closed', 'occupied', 'sleeping'] as const;

const kind = (
  entry: Omit<InteriorKind, 'weight' | 'max'> & Partial<InteriorKind>,
): InteriorKind => ({
  weight: 2,
  max: 1,
  ...entry,
});

/** Every hotel prop; each room type takes the ones that fit it. */
const PROPS = {
  'bed-single': kind({
    kind: 'bed-single',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 15,
    height: 8,
    looks: ['sleep', 'dirty'],
    flip: true,
  }),
  'bed-double': kind({
    kind: 'bed-double',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 22,
    height: 8,
    looks: ['sleep', 'dirty'],
    flip: true,
  }),
  armchair: kind({
    kind: 'armchair',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 8,
    height: 8,
    looks: ['dirty'],
    flip: true,
  }),
  'coffee-table': kind({
    kind: 'coffee-table',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 8,
    height: 7,
    looks: ['busy', 'dirty'],
  }),
  'writing-desk': kind({
    kind: 'writing-desk',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 14,
    height: 11,
    looks: BUSY,
    flip: true,
  }),
  suitcase: kind({
    kind: 'suitcase',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 6,
    height: 7,
    hiddenIn: NO_GUEST,
  }),
  towels: kind({
    kind: 'towels',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 2,
    hiddenIn: NOT_DIRTY,
    flip: true,
  }),
  nightstand: kind({
    kind: 'nightstand',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 6,
    height: 12,
    looks: BUSY,
    weight: 3,
    max: 2,
  }),
  'tv-cabinet': kind({
    kind: 'tv-cabinet',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 10,
    height: 11,
    looks: BUSY,
  }),
  'luggage-rack': kind({
    kind: 'luggage-rack',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 8,
    height: 5,
  }),
  minibar: kind({
    kind: 'minibar',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 6,
    height: 6,
  }),
  dresser: kind({
    kind: 'dresser',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 14,
    height: 10,
    flip: true,
  }),
  'floor-lamp': kind({
    kind: 'floor-lamp',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 13,
    looks: BUSY,
  }),
  'plant-small': kind({
    kind: 'plant-small',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 6,
    weight: 3,
    flip: true,
  }),
  'plant-medium': kind({
    kind: 'plant-medium',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 7,
    height: 12,
    flip: true,
  }),
  partition: kind({
    kind: 'partition',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 3,
    height: 26,
    zones: ['wall'],
  }),
  'wall-lamp': kind({
    kind: 'wall-lamp',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 5,
    height: 5,
    looks: BUSY,
    max: 2,
  }),
  mirror: kind({ kind: 'mirror', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 10 }),
  clock: kind({ kind: 'clock', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 6 }),
  'picture-small': kind({
    kind: 'picture-small',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 8,
    height: 6,
    weight: 3,
    max: 2,
  }),
  'picture-wide': kind({
    kind: 'picture-wide',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 14,
    height: 8,
  }),
} satisfies Record<string, InteriorKind>;

type HotelKind = keyof typeof PROPS;
const pick = (...kinds: HotelKind[]): InteriorKind[] => kinds.map((name) => PROPS[name]);

const WALL: HotelKind[] = ['wall-lamp', 'mirror', 'clock', 'picture-small', 'picture-wide'];

/** What all three room types share: states, looks, curtains, shade and the room's floor rows. */
const HOTEL_COMMON = {
  group: 'hotel',
  states: ['empty', 'vacant', 'closed', 'occupied', 'sleeping', 'dirty', 'infested'],
  propLook: {
    empty: null,
    vacant: 'idle',
    closed: 'idle',
    occupied: 'busy',
    sleeping: 'sleep',
    dirty: 'dirty',
    infested: 'dirty',
  },
  curtains: {
    empty: null,
    vacant: null,
    closed: 'closed',
    occupied: 'open',
    sleeping: 'closed',
    dirty: null,
    infested: null,
  },
  // A guest awake inside keeps the room lit; any other room is dark at night.
  shade: {
    empty: { day: 0, night: 0.55 },
    vacant: { day: 0, night: 0.55 },
    closed: { day: 0.3, night: 0.6 },
    occupied: { day: 0, night: 0 },
    sleeping: { day: 0.3, night: 0.6 },
    dirty: { day: 0, night: 0.55 },
    infested: { day: 0, night: 0.55 },
  },
} as const satisfies Partial<InteriorSpec<HotelState>>;

function room(type: string, width: number) {
  return {
    ...HOTEL_COMMON,
    unitType: type,
    baseSprite: `units/${type}/empty_day`,
    room: { width, height: 32, backFloorRow: 26, frontFloorRow: 28, eyeLine: 9, wallTop: 3 },
    overlays: {
      dirty: [`hotel/overlay/${type}-grime`],
      infested: [`hotel/overlay/${type}-grime`, `hotel/overlay/${type}-roaches`],
    },
  };
}

export const SINGLE_ROOM_INTERIOR: InteriorSpec<HotelState> = {
  ...room('single-room', 32),
  windows: [{ left: 15, top: 4, width: 9, height: 7 }],
  zones: [{ id: 'room', left: 2, right: 29 }],
  catalog: pick(
    'bed-single',
    'suitcase',
    'towels',
    'nightstand',
    'minibar',
    'luggage-rack',
    'plant-small',
    ...WALL,
  ),
  templates: [
    {
      id: 'random',
      name: 'Random',
      fixed: [],
      rolls: [
        { kinds: ['bed-single'], count: [1, 1] },
        { kinds: ['suitcase'], count: [1, 1] },
        { kinds: ['towels'], count: [1, 1] },
        { kinds: ['nightstand', 'minibar', 'luggage-rack', 'plant-small'], count: [0, 1] },
        { kinds: WALL, count: [0, 2] },
      ],
    },
    {
      id: 'classic',
      name: 'Fixed (the old room)',
      fixed: [
        { kind: 'bed-single', x: 13 },
        { kind: 'wall-lamp', x: 25 },
        { kind: 'suitcase', x: 6 },
        { kind: 'towels', x: 18 },
      ],
      rolls: [],
    },
  ],
  fixedSeed: 1,
};

export const DOUBLE_ROOM_INTERIOR: InteriorSpec<HotelState> = {
  ...room('double-room', 48),
  windows: [{ left: 17, top: 4, width: 14, height: 7 }],
  zones: [{ id: 'room', left: 2, right: 45 }],
  catalog: pick(
    'bed-double',
    'armchair',
    'writing-desk',
    'suitcase',
    'towels',
    'nightstand',
    'minibar',
    'luggage-rack',
    'dresser',
    'floor-lamp',
    'plant-small',
    'plant-medium',
    ...WALL,
  ),
  templates: [
    {
      id: 'random',
      name: 'Random',
      fixed: [],
      rolls: [
        { kinds: ['bed-double'], count: [1, 1] },
        { kinds: ['suitcase'], count: [1, 1] },
        { kinds: ['towels'], count: [1, 1] },
        { kinds: ['nightstand'], count: [1, 2] },
        {
          kinds: [
            'armchair',
            'writing-desk',
            'minibar',
            'luggage-rack',
            'dresser',
            'floor-lamp',
            'plant-small',
            'plant-medium',
          ],
          count: [1, 3],
        },
        { kinds: WALL, count: [0, 2] },
      ],
    },
    {
      id: 'classic',
      name: 'Fixed (the old room)',
      fixed: [
        { kind: 'bed-double', x: 13 },
        { kind: 'nightstand', x: 35 },
        { kind: 'plant-small', x: 41 },
        { kind: 'suitcase', x: 4 },
        { kind: 'towels', x: 20 },
      ],
      rolls: [],
    },
  ],
  fixedSeed: 1,
};

export const SUITE_INTERIOR: InteriorSpec<HotelState> = {
  ...room('suite', 80),
  windows: [
    { left: 15, top: 4, width: 14, height: 7 },
    { left: 55, top: 4, width: 14, height: 7 },
  ],
  // The wall between the sitting room and the bedroom is a prop, columns 47 to 49.
  zones: [
    { id: 'living', left: 2, right: 46 },
    { id: 'wall', left: 47, right: 49 },
    { id: 'bedroom', left: 50, right: 77 },
  ],
  catalog: pick(
    'bed-double',
    'armchair',
    'coffee-table',
    'writing-desk',
    'suitcase',
    'towels',
    'nightstand',
    'tv-cabinet',
    'minibar',
    'luggage-rack',
    'dresser',
    'floor-lamp',
    'plant-small',
    'plant-medium',
    'partition',
    ...WALL,
  ),
  templates: [
    {
      id: 'random',
      name: 'Random',
      fixed: [{ kind: 'partition', x: 47 }],
      rolls: [
        { kinds: ['bed-double'], count: [1, 1], zone: 'bedroom' },
        { kinds: ['nightstand'], count: [1, 2], zone: 'bedroom' },
        { kinds: ['suitcase'], count: [1, 1] },
        { kinds: ['towels'], count: [1, 1] },
        {
          kinds: ['armchair', 'coffee-table', 'tv-cabinet', 'writing-desk', 'minibar'],
          count: [2, 4],
          zone: 'living',
        },
        {
          kinds: ['plant-small', 'plant-medium', 'floor-lamp', 'dresser', 'luggage-rack'],
          count: [1, 3],
        },
        { kinds: WALL, count: [1, 3] },
      ],
    },
    {
      id: 'classic',
      name: 'Fixed (the old suite)',
      fixed: [
        { kind: 'armchair', x: 11 },
        { kind: 'coffee-table', x: 20 },
        { kind: 'tv-cabinet', x: 31 },
        { kind: 'plant-small', x: 42 },
        { kind: 'partition', x: 47 },
        { kind: 'bed-double', x: 51 },
        { kind: 'nightstand', x: 72 },
        { kind: 'suitcase', x: 50 },
        { kind: 'towels', x: 56 },
      ],
      rolls: [],
    },
  ],
  fixedSeed: 1,
};
