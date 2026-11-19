import type { InteriorKind, InteriorSpec } from './types';

/**
 * Restaurant: a 24 tile shop with no windows. Props are drawn by
 * tools/art/src/groups/restaurant.mjs. Each unit stores its own seed, like offices. Diners and
 * staff walk in as people; no prop draws one. The shop front starts below the awning, so wall
 * props hang from row 13 down.
 */

export type RestaurantState = 'closed' | 'open' | 'busy';

const BUSY = ['busy'] as const;

const kind = (
  entry: Omit<InteriorKind, 'weight' | 'max'> & Partial<InteriorKind>,
): InteriorKind => ({ weight: 2, max: 1, ...entry });

const CATALOG: readonly InteriorKind[] = [
  // Layer 1: the dining room.
  kind({
    kind: 'table-two',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 20,
    height: 9,
    looks: BUSY,
    weight: 4,
    max: 5,
  }),
  kind({
    kind: 'table-four',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 17,
    height: 9,
    looks: BUSY,
    weight: 3,
    max: 4,
  }),
  kind({
    kind: 'bar',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 24,
    height: 11,
    looks: BUSY,
    flip: true,
  }),
  kind({
    kind: 'host-stand',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 6,
    height: 10,
    looks: BUSY,
  }),
  kind({
    kind: 'piano',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 18,
    height: 12,
    flip: true,
  }),

  // Layer 0: against the back wall.
  kind({
    kind: 'wine-rack',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 14,
    height: 14,
    max: 2,
  }),
  kind({ kind: 'sideboard', layer: 0, mount: 'floor', role: 'functional', width: 14, height: 8 }),
  kind({
    kind: 'coat-stand',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 14,
    flip: true,
  }),
  kind({ kind: 'aquarium', layer: 0, mount: 'floor', role: 'decor', width: 16, height: 12 }),
  kind({
    kind: 'plant-medium',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 7,
    height: 12,
    flip: true,
    max: 2,
  }),

  // Layer 0: hung on the wall.
  kind({
    kind: 'painting',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 8,
    height: 5,
    weight: 3,
    max: 3,
  }),
  kind({
    kind: 'painting-large',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 14,
    height: 9,
    max: 2,
  }),
  kind({
    kind: 'specials-board',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 10,
    height: 8,
  }),
  kind({
    kind: 'sconce',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 3,
    height: 5,
    looks: BUSY,
    weight: 3,
    max: 4,
  }),
  kind({ kind: 'mirror', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 10 }),
  kind({ kind: 'clock', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 6 }),
];

export const RESTAURANT_INTERIOR: InteriorSpec<RestaurantState> = {
  unitType: 'restaurant',
  group: 'restaurant',
  baseSprite: 'units/restaurant/empty_day',
  room: { width: 192, height: 32, backFloorRow: 26, frontFloorRow: 28, eyeLine: 16, wallTop: 13 },
  windows: [],
  zones: [{ id: 'room', left: 2, right: 189 }],
  catalog: CATALOG,
  templates: [
    {
      id: 'random',
      name: 'Random',
      fixed: [],
      rolls: [
        { kinds: ['bar', 'host-stand', 'piano'], count: [1, 2] },
        { kinds: ['table-two', 'table-four'], count: [4, 7] },
        {
          kinds: ['wine-rack', 'sideboard', 'coat-stand', 'aquarium', 'plant-medium'],
          count: [2, 4],
        },
        {
          kinds: ['painting', 'painting-large', 'specials-board', 'sconce', 'mirror', 'clock'],
          count: [3, 6],
        },
      ],
    },
  ],
  states: ['closed', 'open', 'busy'],
  propLook: { closed: 'idle', open: 'idle', busy: 'busy' },
  curtains: { closed: null, open: null, busy: null },
  // An open restaurant keeps its lights on; a closed one is dark behind its shutter at night.
  shade: {
    closed: { day: 0, night: 0.55 },
    open: { day: 0, night: 0 },
    busy: { day: 0, night: 0 },
  },
  overlays: { closed: ['restaurant/overlay/closed'] },
};
