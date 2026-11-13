import type { Level, UnitType } from '@tower-magnate/shared';
import { Container, Graphics, Sprite } from 'pixi.js';
import { levelToIndex, levelTop } from './levels';
import { FLOOR_HEIGHT, TILE_WIDTH } from './metrics';
import type { SpriteRegistry } from './spriteRegistry';
import type { TimeOfDay } from './structurePlan';
import { spriteState } from './unitPlan';

export const GHOST_VALID_COLOR = 0x7ec850;
export const GHOST_INVALID_COLOR = 0xb0353a;
export const HOVER_COLOR = 0xf4f1e8;
const GHOST_ALPHA = 0.65;

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

interface Area {
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
  private readonly sprite = new Sprite();
  private readonly ghostFrame = new Graphics();
  private readonly hoverFrame = new Graphics();
  private readonly runShape = new Graphics();
  private run: RunInput | null = null;
  private zoom = 1;
  private ghost: GhostInput | null = null;
  private highlight: Footprint | null = null;
  private highlightColor = HOVER_COLOR;

  constructor(private readonly sprites: SpriteRegistry) {
    this.sprite.alpha = GHOST_ALPHA;
    this.sprite.visible = false;
    this.view.addChild(this.runShape, this.sprite, this.ghostFrame, this.hoverFrame);
  }

  setZoom(zoom: number): void {
    if (zoom !== this.zoom) {
      this.zoom = zoom;
      this.drawFrames();
    }
  }

  showGhost(ghost: GhostInput | null): void {
    this.ghost = ghost;
    this.sprite.visible = ghost !== null;
    if (ghost !== null) {
      const area = areaOf({ ...ghost, floors: ghost.frameFloors ?? ghost.floors });
      this.sprite.texture = this.sprites.variant(`units/${ghost.type}`, {
        state: spriteState(ghost.type, false),
        time: ghost.time,
      });
      this.sprite.position.set(area.x, area.y);
      this.sprite.width = area.width;
      this.sprite.height = area.height;
      this.sprite.tint = ghost.valid ? 0xffffff : GHOST_INVALID_COLOR;
    }
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

  private drawFrames(): void {
    this.ghostFrame.clear();
    this.hoverFrame.clear();
    this.runShape.clear();
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
      outline(this.ghostFrame, areaOf({ ...this.ghost, floors }), color, this.zoom);
    }
    if (this.highlight !== null) {
      outline(this.hoverFrame, areaOf(this.highlight), this.highlightColor, this.zoom);
    }
  }
}

function outline(frame: Graphics, area: Area, color: number, zoom: number): void {
  const line = 1 / zoom;
  frame
    .rect(area.x + line / 2, area.y + line / 2, area.width - line, area.height - line)
    .stroke({ width: line, color });
}
