import type { Level, UnitType } from '@tower-magnate/shared';
import { Container, Graphics } from 'pixi.js';
import { levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import type { TimeOfDay } from './structurePlan';

export const GHOST_VALID_COLOR = 0x7ec850;
export const GHOST_INVALID_COLOR = 0xb0353a;
export const HOVER_COLOR = 0xf4f1e8;
const GHOST_ALPHA = 0.65;
export const SELECTION_COLOR = 0xf2d36b;
const SELECTION_FILL_ALPHA = 0.18;
const SELECTION_LINE = 2;

/** A footprint whose bottom-left cell is (x, level), sized in tiles and levels. */
export interface Footprint {
  x: number;
  level: Level;
  width: number;
  floors: number;
}

export interface GhostInput extends Footprint {
  /** Levels the ghost (fill and outline) covers when taller than the footprint; only the drawing changes. */
  frameFloors?: number;
  type: UnitType;
  valid: boolean;
  time: TimeOfDay;
}

/** A run of plain tiles, such as the floor being dragged out. */
export interface RunInput extends Footprint {
  valid: boolean;
}

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** World pixels of a footprint. */
export function areaOf(footprint: Footprint): Area {
  const bottomIndex = levelToIndex(footprint.level);
  return {
    x: footprint.x * TILE_WIDTH,
    y: levelTop(bottomIndex + footprint.floors - 1),
    width: footprint.width * TILE_WIDTH,
    height: footprint.floors * FLOOR_HEIGHT,
  };
}

/**
 * The placement ghost and the hover frame, drawn above everything else. Both
 * snap to whole tiles, and their outline is one screen pixel at any zoom.
 */
export class GhostLayer {
  readonly view = new Container();
  private readonly ghostFrame = new Graphics();
  private readonly hoverFrame = new Graphics();
  private readonly runShape = new Graphics();
  private run: RunInput | null = null;
  private zoom = 1;
  private ghost: GhostInput | null = null;
  private highlight: Footprint | null = null;
  private highlightColor = HOVER_COLOR;
  private selection: Area[] = [];
  private readonly selectionFrame = new Graphics();

  constructor() {
    this.view.addChild(this.runShape, this.ghostFrame, this.selectionFrame, this.hoverFrame);
  }

  setZoom(zoom: number): void {
    if (zoom !== this.zoom) {
      this.zoom = zoom;
      this.drawFrames();
    }
  }

  showGhost(ghost: GhostInput | null): void {
    this.ghost = ghost;
    this.drawFrames();
  }

  showRun(run: RunInput | null): void {
    this.run = run;
    this.drawFrames();
  }

  showHighlight(highlight: Footprint | null, color: number = HOVER_COLOR): void {
    this.highlight = highlight;
    this.highlightColor = color;
    this.drawFrames();
  }

  /** Frames the units whose information panel is open, in world pixels. */
  showSelection(areas: Area[]): void {
    this.selection = areas;
    this.drawFrames();
  }

  private drawFrames(): void {
    this.ghostFrame.clear();
    this.hoverFrame.clear();
    this.runShape.clear();
    this.selectionFrame.clear();
    for (const area of this.selection) {
      this.selectionFrame
        .rect(area.x, area.y, area.width, area.height)
        .fill({ color: SELECTION_COLOR, alpha: SELECTION_FILL_ALPHA });
      outline(this.selectionFrame, area, SELECTION_COLOR, this.zoom, SELECTION_LINE);
    }
    if (this.run !== null) {
      const color = this.run.valid ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR;
      const area = areaOf(this.run);
      this.runShape
        .rect(area.x, area.y, area.width, area.height)
        .fill({ color, alpha: GHOST_ALPHA });
      outline(this.runShape, area, color, this.zoom);
    }
    if (this.ghost !== null) {
      const color = this.ghost.valid ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR;
      const floors = this.ghost.frameFloors ?? this.ghost.floors;
      const area = areaOf({ ...this.ghost, floors });
      this.ghostFrame
        .rect(area.x, area.y, area.width, area.height)
        .fill({ color, alpha: GHOST_ALPHA });
    }
    if (this.highlight !== null) {
      outline(this.hoverFrame, areaOf(this.highlight), this.highlightColor, this.zoom);
    }
  }
}

function outline(frame: Graphics, area: Area, color: number, zoom: number, pixels = 1): void {
  const line = pixels / zoom;
  frame
    .rect(area.x + line / 2, area.y + line / 2, area.width - line, area.height - line)
    .stroke({ width: line, color });
}
