import type { TowerState } from '@tower-magnate/shared';
import { buildTower } from './tower-builder';

const CATHEDRAL_LEVEL = 101;
const CATHEDRAL_X = 170;
const ROOM_LEVEL = 2;
const ROOM_X = 41;

/**
 * A 100-floor tower with a cathedral on top and one dirty hotel room, for looking at the wedding
 * and infestation scenes. Rating 5 so the cathedral is unlocked.
 */
export function eventShowcaseTower(): TowerState {
  const { state, unitIds } = buildTower({
    lobby: { x0: 40, x1: 339 },
    floors: [
      { from: 2, to: 100, x0: 40, x1: 339 },
      { from: 101, to: 104, x0: 140, x1: 200 },
    ],
    units: [
      { type: 'single-room', level: ROOM_LEVEL, x: ROOM_X },
      { type: 'cathedral', level: CATHEDRAL_LEVEL, x: CATHEDRAL_X },
    ],
    shafts: [
      { type: 'express', x: 60, bottom: 1, top: 90 },
      { type: 'standard', x: 150, bottom: 90, top: 101 },
    ],
  });
  const room = state.units[unitIds[0] as string];
  if (room?.hotel) room.hotel.state = 'dirty';
  state.stars = 5;
  return state;
}
