import type { InteriorKind, InteriorSpec } from './types';

/**
 * Housekeeping: a 15 tile laundry with two windows. Props are drawn by
 * tools/art/src/groups/housekeeping.mjs. Each unit stores its own seed, like offices.
 * The maids are props shown only while the crew is in.
 */

export type HousekeepingState = 'closed' | 'occupied';

const BUSY = ['busy'] as const;
const CREW_OUT = ['closed'] as const;

const CATALOG: readonly InteriorKind[] = [
  // Layer 1: the middle of the room.
  {
    kind: 'cart',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 10,
    height: 8,
    weight: 3,
    max: 2,
    flip: true,
  },
  {
    kind: 'laundry-basket',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 7,
    height: 6,
    weight: 2,
    max: 2,
  },
  {
    kind: 'ironing-board',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 14,
    height: 10,
    weight: 2,
    max: 1,
    looks: BUSY,
    flip: true,
  },
  {
    kind: 'folding-table',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 16,
    height: 8,
    weight: 2,
    max: 1,
  },
  {
    kind: 'mop-bucket',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 7,
    height: 9,
    weight: 2,
    max: 1,
    flip: true,
  },
  {
    kind: 'maid-light',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 13,
    weight: 1,
    max: 1,
    hiddenIn: CREW_OUT,
    flip: true,
  },
  {
    kind: 'maid-mid',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 13,
    weight: 1,
    max: 1,
    hiddenIn: CREW_OUT,
    flip: true,
  },
  {
    kind: 'maid-dark',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 13,
    weight: 1,
    max: 1,
    hiddenIn: CREW_OUT,
    flip: true,
  },

  // Layer 0: against the wall, on the floor.
  {
    kind: 'linen-shelf',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 14,
    height: 18,
    weight: 3,
    max: 3,
  },
  {
    kind: 'washer',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 10,
    height: 11,
    weight: 3,
    max: 3,
    looks: BUSY,
  },
  {
    kind: 'dryer',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 10,
    height: 11,
    weight: 2,
    max: 2,
    looks: BUSY,
  },
  {
    kind: 'sink',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 8,
    height: 12,
    weight: 2,
    max: 1,
  },
  {
    kind: 'supply-cabinet',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 20,
    weight: 2,
    max: 1,
  },

  // Layer 0: hung on the wall.
  {
    kind: 'time-clock',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 5,
    height: 5,
    weight: 1,
    max: 1,
  },
  {
    kind: 'detergent-shelf',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 11,
    height: 5,
    weight: 2,
    max: 2,
    flip: true,
  },
  {
    kind: 'corkboard',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 12,
    height: 8,
    weight: 2,
    max: 1,
  },
  {
    kind: 'calendar',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 5,
    height: 7,
    weight: 2,
    max: 1,
  },
  { kind: 'clock', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 6, weight: 2, max: 1 },
];

const MACHINES = ['washer', 'dryer'];
const STORAGE = ['linen-shelf', 'sink', 'supply-cabinet'];
const FLOOR_WORK = ['laundry-basket', 'ironing-board', 'folding-table', 'mop-bucket'];
const MAIDS = ['maid-light', 'maid-mid', 'maid-dark'];
const WALL_EXTRAS = ['detergent-shelf', 'corkboard', 'calendar', 'clock'];

export const HOUSEKEEPING_INTERIOR: InteriorSpec<HousekeepingState> = {
  unitType: 'housekeeping',
  group: 'housekeeping',
  baseSprite: 'units/housekeeping/empty_day',
  room: { width: 120, height: 32, backFloorRow: 26, frontFloorRow: 28, eyeLine: 9, wallTop: 3 },
  windows: [
    { left: 49, top: 4, width: 12, height: 7 },
    { left: 81, top: 4, width: 12, height: 7 },
  ],
  zones: [{ id: 'room', left: 2, right: 117 }],
  catalog: CATALOG,
  templates: [
    {
      id: 'random',
      name: 'Random',
      fixed: [],
      rolls: [
        { kinds: MACHINES, count: [2, 4] },
        { kinds: STORAGE, count: [2, 4] },
        { kinds: ['cart'], count: [1, 2] },
        { kinds: FLOOR_WORK, count: [1, 3] },
        { kinds: MAIDS, count: [2, 3] },
        { kinds: ['time-clock'], count: [1, 1] },
        { kinds: WALL_EXTRAS, count: [0, 3] },
      ],
    },
    {
      id: 'classic',
      name: 'Fixed (the old housekeeping)',
      fixed: [
        { kind: 'time-clock', x: 12 },
        { kind: 'linen-shelf', x: 19 },
        { kind: 'linen-shelf', x: 35 },
        { kind: 'washer', x: 64 },
        { kind: 'washer', x: 75 },
        { kind: 'sink', x: 93 },
        { kind: 'cart', x: 52 },
        { kind: 'cart', x: 108 },
        { kind: 'maid-light', x: 13 },
        { kind: 'maid-mid', x: 86 },
        { kind: 'maid-dark', x: 100 },
      ],
      rolls: [],
    },
  ],
  states: ['closed', 'occupied'],
  propLook: { closed: 'idle', occupied: 'busy' },
  curtains: { closed: 'closed', occupied: 'open' },
  shade: {
    closed: { day: 0.3, night: 0.6 },
    occupied: { day: 0, night: 0 },
  },
};
