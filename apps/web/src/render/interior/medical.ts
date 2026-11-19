import type { InteriorKind, InteriorSpec } from './types';

/**
 * Medical center: a 26 tile room with three windows, a ward on the left and the reception on
 * the right. Props are drawn by tools/art/src/groups/medical.mjs. Each unit stores its own
 * seed, like offices. Patients and nurses walk in as people; a bed in use is drawn empty.
 */

export type MedicalState = 'closed' | 'occupied';

const BUSY = ['busy'] as const;

const kind = (
  entry: Omit<InteriorKind, 'weight' | 'max'> & Partial<InteriorKind>,
): InteriorKind => ({ weight: 2, max: 1, ...entry });

const CATALOG: readonly InteriorKind[] = [
  // Layer 1: the middle of the room.
  kind({
    kind: 'hospital-bed',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 30,
    height: 14,
    looks: BUSY,
    flip: true,
    weight: 3,
    max: 3,
    zones: ['ward'],
  }),
  kind({
    kind: 'exam-table',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 20,
    height: 9,
    flip: true,
  }),
  kind({
    kind: 'gurney',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 24,
    height: 9,
    flip: true,
  }),
  kind({
    kind: 'wheelchair',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 9,
    height: 10,
    flip: true,
    max: 2,
  }),
  kind({
    kind: 'iv-stand',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 5,
    height: 16,
    max: 2,
    zones: ['ward'],
  }),
  kind({
    kind: 'privacy-screen',
    layer: 1,
    mount: 'floor',
    role: 'decor',
    width: 13,
    height: 15,
    zones: ['ward'],
  }),
  kind({
    kind: 'reception-desk',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 20,
    height: 10,
    flip: true,
    zones: ['reception'],
  }),
  kind({
    kind: 'waiting-chairs',
    layer: 1,
    mount: 'floor',
    role: 'functional',
    width: 20,
    height: 8,
    max: 2,
    zones: ['reception'],
  }),

  // Layer 0: against the wall, on the floor.
  kind({
    kind: 'medicine-cabinet',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 18,
    height: 14,
    weight: 3,
  }),
  kind({
    kind: 'vitals-monitor',
    layer: 0,
    mount: 'floor',
    role: 'functional',
    width: 8,
    height: 14,
    looks: BUSY,
    weight: 3,
    max: 3,
    zones: ['ward'],
  }),
  kind({ kind: 'sink', layer: 0, mount: 'floor', role: 'functional', width: 8, height: 12 }),
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
    kind: 'red-cross',
    layer: 0,
    mount: 'wall',
    role: 'decor',
    width: 12,
    height: 10,
    weight: 3,
  }),
  kind({
    kind: 'light-box',
    layer: 0,
    mount: 'wall',
    role: 'functional',
    width: 14,
    height: 9,
    looks: BUSY,
  }),
  kind({ kind: 'eye-chart', layer: 0, mount: 'wall', role: 'functional', width: 7, height: 10 }),
  kind({ kind: 'first-aid', layer: 0, mount: 'wall', role: 'functional', width: 8, height: 6 }),
  kind({ kind: 'clock', layer: 0, mount: 'wall', role: 'decor', width: 6, height: 6 }),
];

export const MEDICAL_INTERIOR: InteriorSpec<MedicalState> = {
  unitType: 'medical-center',
  group: 'medical',
  baseSprite: 'units/medical-center/empty_day',
  room: { width: 208, height: 32, backFloorRow: 26, frontFloorRow: 28, eyeLine: 9, wallTop: 3 },
  windows: [
    { left: 10, top: 4, width: 14, height: 8 },
    { left: 56, top: 4, width: 14, height: 8 },
    { left: 150, top: 4, width: 14, height: 8 },
  ],
  zones: [
    { id: 'ward', left: 2, right: 135 },
    { id: 'reception', left: 138, right: 205 },
  ],
  catalog: CATALOG,
  templates: [
    {
      id: 'random',
      name: 'Random',
      fixed: [],
      rolls: [
        { kinds: ['hospital-bed'], count: [2, 3], zone: 'ward' },
        { kinds: ['vitals-monitor'], count: [1, 3], zone: 'ward' },
        { kinds: ['iv-stand', 'privacy-screen', 'wheelchair'], count: [1, 2], zone: 'ward' },
        { kinds: ['reception-desk'], count: [1, 1], zone: 'reception' },
        { kinds: ['waiting-chairs'], count: [1, 2], zone: 'reception' },
        { kinds: ['exam-table', 'gurney', 'wheelchair'], count: [0, 1] },
        { kinds: ['medicine-cabinet', 'sink', 'plant-medium'], count: [1, 3] },
        { kinds: ['red-cross', 'light-box', 'eye-chart', 'first-aid', 'clock'], count: [2, 4] },
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
