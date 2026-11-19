import type { InteriorKind, InteriorSpec } from './types';

/**
 * Security office: a 16 tile room with one window. Props are drawn by
 * tools/art/src/groups/security.mjs. Each unit stores its own seed, like offices. Officers walk
 * in as people; no prop draws one.
 */

export type SecurityState = 'closed' | 'occupied';

const BUSY = ['busy'] as const;

const kind = (
  entry: Omit<InteriorKind, 'weight' | 'max'> & Partial<InteriorKind>,
): InteriorKind => ({ weight: 2, max: 1, ...entry });

const CATALOG: readonly InteriorKind[] = [
  // Layer 1: the middle of the room.
  kind({
    kind: 'control-desk',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 28,
    height: 11,
    looks: BUSY,
    flip: true,
  }),
  kind({
    kind: 'desk',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 18,
    height: 11,
    looks: BUSY,
    flip: true,
    max: 2,
  }),
  kind({ kind: 'bench', layer: 1, mount: 'floor', role: 'decor', width: 14, height: 6 }),

  // Layer 0: against the wall, on the floor.
  kind({
    kind: 'lockers',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 15,
    height: 20,
    weight: 3,
    max: 2,
  }),
  kind({
    kind: 'filing-cabinet',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 8,
    height: 14,
    max: 2,
  }),
  kind({ kind: 'water-cooler', layer: 0, mount: 'floor', role: 'decor', width: 5, height: 14 }),
  kind({
    kind: 'recorder-rack',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 9,
    height: 18,
    looks: BUSY,
  }),
  kind({
    kind: 'coat-rack',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 5,
    height: 16,
    flip: true,
  }),
  kind({
    kind: 'plant-medium',
    layer: 0,
    mount: 'floor',
    role: 'decor',
    width: 7,
    height: 12,
    flip: true,
  }),

  // Layer 0: hung on the wall.
  kind({
    kind: 'monitor-wall',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 32,
    height: 12,
    looks: BUSY,
    weight: 3,
  }),
  kind({
    kind: 'monitor-pair',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 18,
    height: 9,
    looks: BUSY,
  }),
  kind({ kind: 'shield', layer: 0, mount: 'wall', role: 'decor', width: 9, height: 9 }),
  kind({ kind: 'floor-plan', layer: 0, mount: 'wall', role: 'functional', width: 14, height: 9 }),
  kind({ kind: 'key-cabinet', layer: 0, mount: 'wall', role: 'functional', width: 8, height: 7 }),
  kind({
    kind: 'radio-charger',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 10,
    height: 4,
    looks: BUSY,
  }),
  kind({ kind: 'corkboard', layer: 0, mount: 'wall', role: 'functional', width: 12, height: 8 }),
  kind({ kind: 'clock', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 6 }),
];

export const SECURITY_INTERIOR: InteriorSpec<SecurityState> = {
  unitType: 'security',
  group: 'security',
  baseSprite: 'units/security/empty_day',
  room: { width: 128, height: 32, backFloorRow: 26, frontFloorRow: 28, eyeLine: 9, wallTop: 3 },
  windows: [{ left: 6, top: 4, width: 12, height: 7 }],
  zones: [{ id: 'room', left: 2, right: 125 }],
  catalog: CATALOG,
  templates: [
    {
      id: 'random',
      name: 'Random',
      fixed: [],
      rolls: [
        { kinds: ['monitor-wall', 'monitor-pair'], count: [1, 2] },
        { kinds: ['control-desk'], count: [1, 1] },
        { kinds: ['lockers'], count: [1, 2] },
        {
          kinds: ['recorder-rack', 'filing-cabinet', 'water-cooler', 'coat-rack', 'plant-medium'],
          count: [1, 3],
        },
        { kinds: ['desk', 'bench'], count: [0, 2] },
        {
          kinds: ['shield', 'floor-plan', 'key-cabinet', 'radio-charger', 'corkboard', 'clock'],
          count: [1, 3],
        },
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
