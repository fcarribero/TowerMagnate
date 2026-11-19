import type { InteriorKind, InteriorSpec } from './types';

/**
 * Obrador: the builders' site office, the same 15 tile room as housekeeping, with tools,
 * uniforms and building materials. Props are drawn by tools/art/src/groups/obrador.mjs. Each
 * unit stores its own seed, like offices. The builders walk in as people; no prop draws one.
 */

export type ObradorState = 'closed' | 'occupied';

const BUSY = ['busy'] as const;

const kind = (
  entry: Omit<InteriorKind, 'weight' | 'max'> & Partial<InteriorKind>,
): InteriorKind => ({ weight: 2, max: 1, ...entry });

const CATALOG: readonly InteriorKind[] = [
  // Layer 1: the middle of the room.
  kind({
    kind: 'workbench',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 20,
    height: 10,
    flip: true,
    weight: 3,
  }),
  kind({
    kind: 'wheelbarrow',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 14,
    height: 7,
    flip: true,
  }),
  kind({ kind: 'lumber-pile', layer: 1, mount: 'floor', role: 'functional', width: 18, height: 6 }),
  kind({
    kind: 'sawhorse',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 7,
    max: 2,
  }),
  kind({ kind: 'cones', layer: 1, mount: 'floor', role: 'decor', width: 4, height: 6, max: 3 }),

  // Layer 0: against the wall, on the floor.
  kind({
    kind: 'uniform-rack',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 16,
    height: 18,
    looks: BUSY,
    weight: 3,
    max: 2,
  }),
  kind({
    kind: 'lockers',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 15,
    height: 20,
    max: 2,
  }),
  kind({
    kind: 'tool-chest',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 12,
    weight: 3,
  }),
  kind({ kind: 'ladder', layer: 0, mount: 'floor', role: 'functional', width: 7, height: 20 }),
  kind({
    kind: 'cement-bags',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 12,
    height: 7,
    max: 2,
  }),
  kind({ kind: 'paint-cans', layer: 0, mount: 'floor', role: 'decor', width: 8, height: 5 }),
  kind({ kind: 'drill', layer: 0, mount: 'floor', role: 'decor', width: 7, height: 6 }),

  // Layer 0: hung on the wall.
  kind({
    kind: 'pegboard',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 18,
    height: 10,
    looks: BUSY,
    weight: 3,
    max: 2,
  }),
  kind({
    kind: 'hard-hat-shelf',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 12,
    height: 4,
    looks: BUSY,
    max: 2,
  }),
  kind({ kind: 'blueprint', layer: 0, mount: 'wall', role: 'functional', width: 14, height: 8 }),
  kind({ kind: 'safety-poster', layer: 0, mount: 'wall', role: 'decor', width: 8, height: 9 }),
  kind({
    kind: 'time-clock',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 5,
    height: 5,
    weight: 1,
  }),
  kind({ kind: 'clock', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 6 }),
];

export const OBRADOR_INTERIOR: InteriorSpec<ObradorState> = {
  unitType: 'obrador',
  group: 'obrador',
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
        { kinds: ['uniform-rack', 'lockers'], count: [2, 3] },
        { kinds: ['pegboard', 'hard-hat-shelf'], count: [1, 3] },
        { kinds: ['tool-chest', 'ladder', 'cement-bags', 'paint-cans', 'drill'], count: [2, 4] },
        { kinds: ['workbench'], count: [1, 1] },
        { kinds: ['wheelbarrow', 'lumber-pile', 'sawhorse', 'cones'], count: [1, 3] },
        { kinds: ['time-clock'], count: [1, 1] },
        { kinds: ['blueprint', 'safety-poster', 'clock'], count: [0, 2] },
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
