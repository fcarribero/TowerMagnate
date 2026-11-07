import { FLOOR_HEIGHT } from './metrics';

export interface Point {
  x: number;
  y: number;
}

const FLOORS_VISIBLE_BELOW_GROUND = 2;

/** Device-pixel position of the left end of ground level. */
export function groundOrigin(deviceWidth: number, deviceHeight: number, zoom: number): Point {
  const basementSpace = FLOORS_VISIBLE_BELOW_GROUND * FLOOR_HEIGHT * zoom;
  return {
    x: Math.floor(deviceWidth / 8),
    y: Math.max(0, Math.floor(deviceHeight - basementSpace)),
  };
}
