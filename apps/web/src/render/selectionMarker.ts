import { levelToIndex, type Level } from '@tower-magnate/shared';
import { Container, Graphics } from 'pixi.js';
import type { WorldRect } from './camera';
import { levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import { FRAME_WIDTH } from './personLook';

const ARROW_COLOR = 0x3ddc5a;
const ARROW_EDGE = 0x13471f;
const PATH_COLOR = 0xffd23f;
const PATH_ALPHA = 0.9;
/** Row of a floor tile where people's feet are. */
const FEET_ROW = 28;
/** Height of the path above the feet: a quarter of a floor. */
const PATH_LIFT = FLOOR_HEIGHT / 4;
/** Row of a floor tile the path runs along. */
const PATH_ROW = FEET_ROW - PATH_LIFT;
/** Gap between the top of the head and the tip of the arrow at the lowest point of its bob. */
const ARROW_GAP = 2;
/** World pixels the arrow moves up and down. */
const BOB_HEIGHT = 2;
/** Milliseconds of one full bob. */
const BOB_PERIOD_MS = 900;

/** A cell a person's trip goes through, as the server plans it. */
export interface PathPoint {
  level: Level;
  x: number;
}

/** Where the path runs through a cell, in world pixels at zoom 1. */
export function pathPointInWorld(point: PathPoint): { x: number; y: number } {
  return {
    x: point.x * TILE_WIDTH + FRAME_WIDTH / 2,
    y: levelTop(levelToIndex(point.level)) + PATH_ROW,
  };
}

/** Rows the arrow is lifted by at `now`: a smooth bob between 0 and BOB_HEIGHT. */
export function bobOffset(now: number): number {
  const phase = (now % BOB_PERIOD_MS) / BOB_PERIOD_MS;
  return Math.round(((1 - Math.cos(phase * Math.PI * 2)) / 2) * BOB_HEIGHT);
}

/**
 * The green arrow over the selected person and the yellow line of the route they are taking,
 * from their feet through every flight and shaft to where the trip ends.
 */
export class SelectionMarker {
  readonly view = new Container();
  private readonly pathLine = new Graphics();
  private readonly arrow = new Graphics();
  private path: readonly PathPoint[] = [];
  private drawnKey = '';

  constructor() {
    this.view.addChild(this.pathLine);
    this.view.addChild(this.arrow);
    drawArrow(this.arrow);
    this.arrow.visible = false;
  }

  /** The route of the selected person; an empty list removes the line. */
  setPath(path: readonly PathPoint[]): void {
    this.path = path;
    this.drawnKey = '';
  }

  /** Puts the arrow over `rect` and runs the line from its feet; null hides both. */
  show(rect: WorldRect | null, now: number): void {
    if (rect === null) {
      this.arrow.visible = false;
      this.pathLine.visible = false;
      return;
    }
    const centerX = rect.x + rect.width / 2;
    this.arrow.visible = true;
    this.arrow.position.set(Math.round(centerX), Math.round(rect.y - ARROW_GAP - bobOffset(now)));
    this.drawPath(centerX, rect.y + rect.height - PATH_LIFT);
  }

  private drawPath(fromX: number, fromY: number): void {
    // The first point is where the person stood when the server planned; the live feet replace it.
    const rest = this.path.slice(1);
    if (rest.length === 0) {
      this.pathLine.visible = false;
      return;
    }
    const key = `${Math.round(fromX)},${Math.round(fromY)}`;
    this.pathLine.visible = true;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const line = this.pathLine;
    line.clear();
    line.moveTo(fromX, fromY);
    for (const point of rest) {
      const at = pathPointInWorld(point);
      line.lineTo(at.x, at.y);
    }
    line.stroke({ color: PATH_COLOR, alpha: PATH_ALPHA, width: 1 });
  }
}

/** A pixel arrow pointing down with its tip at (0, 0). */
function drawArrow(arrow: Graphics): void {
  // Outline first, then the green body one pixel smaller on every side.
  arrow
    .poly([-4, -5, 4, -5, 0, 0])
    .fill(ARROW_EDGE)
    .rect(-2, -9, 4, 5)
    .fill(ARROW_EDGE)
    .poly([-3, -4, 3, -4, 0, -1])
    .fill(ARROW_COLOR)
    .rect(-1, -8, 2, 4)
    .fill(ARROW_COLOR);
}
