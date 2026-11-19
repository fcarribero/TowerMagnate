import type { InteriorKind, InteriorSpec } from './types';

/**
 * The building's cleaning room: the same 15 tile room as housekeeping, with tools and products
 * instead of washers and linen. Props are drawn by tools/art/src/groups/cleaning.mjs. Each unit
 * stores its own seed, like offices. The crew walks in as people; no prop draws a person.
 */

export type CleaningState = 'closed' | 'occupied';

const BUSY = ['busy'] as const;

const CATALOG: readonly InteriorKind[] = [
  // Layer 1: the middle of the room.
  {
    kind: 'janitor-cart',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 14,
    height: 11,
    weight: 3,
    max: 2,
    flip: true,
  },
  {
    kind: 'mop-bucket',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 7,
    height: 9,
    weight: 2,
    max: 2,
    flip: true,
  },
  {
    kind: 'wet-floor-sign',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 8,
    weight: 2,
    max: 2,
  },
  {
    kind: 'floor-scrubber',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 10,
    weight: 2,
    max: 1,
    flip: true,
  },

  // Layer 0: against the wall, on the floor.
  {
    kind: 'tool-rack',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 14,
    height: 20,
    weight: 3,
    max: 2,
    looks: BUSY,
  },
  {
    kind: 'chemical-shelf',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 14,
    height: 18,
    weight: 3,
    max: 2,
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
  {
    kind: 'drum',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 7,
    height: 10,
    weight: 2,
    max: 2,
  },
  {
    kind: 'paper-stock',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 10,
    height: 9,
    weight: 2,
    max: 2,
  },
  {
    kind: 'vacuum',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 5,
    height: 13,
    weight: 2,
    max: 1,
    flip: true,
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
    weight: 3,
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

const PRODUCTS = ['chemical-shelf', 'supply-cabinet', 'drum', 'paper-stock'];
const TOOLS = ['vacuum', 'sink'];
const FLOOR_WORK = ['mop-bucket', 'wet-floor-sign', 'floor-scrubber'];
const WALL_EXTRAS = ['detergent-shelf', 'corkboard', 'calendar', 'clock'];

export const CLEANING_ROOM_INTERIOR: InteriorSpec<CleaningState> = {
  unitType: 'cleaning-room',
  group: 'cleaning',
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
        { kinds: ['tool-rack'], count: [1, 2] },
        { kinds: PRODUCTS, count: [2, 4] },
        { kinds: TOOLS, count: [0, 2] },
        { kinds: ['janitor-cart'], count: [1, 2] },
        { kinds: FLOOR_WORK, count: [1, 3] },
        { kinds: ['time-clock'], count: [1, 1] },
        { kinds: WALL_EXTRAS, count: [1, 3] },
      ],
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
