import type { InteriorKind, InteriorSpec } from './types';

/**
 * Parking space: a 4 tile bay that holds one vehicle, seen from the front. The seed picks which
 * of the hundred vehicles (`car-00` to `car-99`, drawn by tools/art/src/groups/parking.mjs) is
 * parked; the engine gives the space a new seed every time it is taken. Every vehicle sprite is
 * the same size with the vehicle centered at the bottom, and the bay has room for exactly one,
 * so it always stands at the same spot. The lamps are always on: there is no shade by day or
 * by night. A disconnected space lays its dead lamps and red cross over the bare bay.
 */

export type ParkingState = 'closed' | 'occupied' | 'disconnected';

export const VEHICLE_COUNT = 100;

const VEHICLES: readonly InteriorKind[] = Array.from({ length: VEHICLE_COUNT }, (_, index) => ({
  kind: `car-${String(index).padStart(2, '0')}`,
  layer: 1,
  mount: 'floor',
  role: 'functional',
  width: 22,
  height: 16,
  weight: 1,
  max: 1,
}));

export const PARKING_SPACE_INTERIOR: InteriorSpec<ParkingState> = {
  unitType: 'parking-space',
  group: 'parking',
  baseSprite: 'units/parking-space/empty_day',
  room: { width: 32, height: 32, backFloorRow: 26, frontFloorRow: 28, eyeLine: 9, wallTop: 3 },
  windows: [],
  // Between the lane mark on the left and the pillar on the right.
  zones: [{ id: 'bay', left: 3, right: 24 }],
  catalog: VEHICLES,
  templates: [
    {
      id: 'random',
      name: 'Random',
      fixed: [],
      rolls: [{ kinds: VEHICLES.map((entry) => entry.kind), count: [1, 1] }],
    },
  ],
  states: ['closed', 'occupied', 'disconnected'],
  propLook: { closed: null, occupied: 'idle', disconnected: null },
  curtains: { closed: null, occupied: null, disconnected: null },
  shade: {
    closed: { day: 0, night: 0 },
    occupied: { day: 0, night: 0 },
    disconnected: { day: 0, night: 0 },
  },
  overlays: { disconnected: ['parking/overlay/disconnected'] },
};
