import type { InteriorKind, InteriorSpec } from './types';

/**
 * Fast food: a 16 tile shop with no windows. The kitchen and the counter take the left of the
 * shop, the tables the right. Props are drawn by tools/art/src/groups/fast-food.mjs. Each unit
 * stores its own seed, like offices. Customers and crew walk in as people; no prop draws one.
 * The shop front starts below the awning, so wall props hang from row 13 down.
 */

export type FastFoodState = 'closed' | 'open' | 'busy';

const BUSY = ['busy'] as const;

const kind = (
  entry: Omit<InteriorKind, 'weight' | 'max'> & Partial<InteriorKind>,
): InteriorKind => ({
  weight: 2,
  max: 1,
  ...entry,
});

const CATALOG: readonly InteriorKind[] = [
  // Layer 1: the middle of the shop.
  kind({
    kind: 'counter',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 26,
    height: 10,
    looks: BUSY,
    flip: true,
    zones: ['kitchen'],
  }),
  kind({
    kind: 'booth',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 18,
    height: 10,
    looks: BUSY,
    weight: 3,
    max: 2,
    zones: ['dining'],
  }),
  kind({
    kind: 'table-chairs',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 16,
    height: 9,
    looks: BUSY,
    weight: 3,
    max: 2,
    zones: ['dining'],
  }),
  kind({
    kind: 'stool-table',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 11,
    height: 10,
    max: 2,
    zones: ['dining'],
  }),

  // Layer 0: the kitchen, against the back wall.
  kind({
    kind: 'fryer',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 9,
    height: 10,
    looks: BUSY,
    weight: 3,
    max: 2,
    zones: ['kitchen'],
  }),
  kind({
    kind: 'grill',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 10,
    height: 10,
    looks: BUSY,
    weight: 3,
    zones: ['kitchen'],
  }),
  kind({
    kind: 'soda-fountain',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 8,
    height: 12,
    looks: BUSY,
    zones: ['kitchen'],
  }),
  kind({
    kind: 'shake-machine',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 6,
    height: 11,
    zones: ['kitchen'],
  }),
  kind({
    kind: 'warmer',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 10,
    height: 12,
    looks: BUSY,
    zones: ['kitchen'],
  }),

  // Layer 0: the dining room, against the back wall.
  kind({
    kind: 'drinks-fridge',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 8,
    height: 14,
  }),
  kind({
    kind: 'trash-bin',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 6,
    height: 9,
    max: 2,
    zones: ['dining'],
  }),
  kind({
    kind: 'condiment-stand',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 7,
    height: 10,
    zones: ['dining'],
  }),
  kind({
    kind: 'plant-medium',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 7,
    height: 12,
    max: 2,
    flip: true,
    zones: ['dining'],
  }),

  // Layer 0: hung on the wall.
  kind({
    kind: 'menu-board',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 18,
    height: 8,
    weight: 3,
    max: 2,
    zones: ['kitchen'],
  }),
  kind({
    kind: 'menu-board-small',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 10,
    height: 8,
    max: 2,
  }),
  kind({
    kind: 'promo-poster',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 7,
    height: 9,
    weight: 3,
    max: 3,
  }),
  kind({ kind: 'clock', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 6 }),
];

const KITCHEN = ['fryer', 'grill', 'soda-fountain', 'shake-machine', 'warmer'];
const MENUS = ['menu-board', 'menu-board-small'];
const TABLES = ['booth', 'table-chairs', 'stool-table'];
const DINING_BACK = ['drinks-fridge', 'trash-bin', 'condiment-stand', 'plant-medium'];
const WALL = ['promo-poster', 'clock', 'menu-board-small'];

export const FAST_FOOD_INTERIOR: InteriorSpec<FastFoodState> = {
  unitType: 'fast-food',
  group: 'fast-food',
  baseSprite: 'units/fast-food/empty_day',
  room: { width: 128, height: 32, backFloorRow: 26, frontFloorRow: 28, eyeLine: 16, wallTop: 13 },
  windows: [],
  zones: [
    { id: 'kitchen', left: 2, right: 50 },
    { id: 'dining', left: 53, right: 125 },
  ],
  catalog: CATALOG,
  templates: [
    {
      id: 'random',
      name: 'Random',
      fixed: [],
      rolls: [
        { kinds: ['counter'], count: [1, 1], zone: 'kitchen' },
        { kinds: KITCHEN, count: [2, 3], zone: 'kitchen' },
        { kinds: MENUS, count: [1, 2], zone: 'kitchen' },
        { kinds: TABLES, count: [2, 4], zone: 'dining' },
        { kinds: DINING_BACK, count: [1, 3], zone: 'dining' },
        { kinds: WALL, count: [1, 3], zone: 'dining' },
      ],
    },
  ],
  states: ['closed', 'open', 'busy'],
  propLook: { closed: 'idle', open: 'idle', busy: 'busy' },
  curtains: { closed: null, open: null, busy: null },
  // An open shop keeps its lights on; a closed one is dark behind its shutter at night.
  shade: {
    closed: { day: 0, night: 0.55 },
    open: { day: 0, night: 0 },
    busy: { day: 0, night: 0 },
  },
  overlays: { closed: ['fast-food/overlay/closed'] },
};
