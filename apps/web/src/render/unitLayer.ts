import type { OverlayData } from '@tower-magnate/shared';
import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { buildStageFor, siteRects } from './constructionStages';
import { CulledRows } from './culledRows';
import type { Camera, LevelRange, WorldRect } from './camera';
import { levelTop } from './levels';
import { altitudeAtWorldY } from './skyRows';
import { DepthRoom, MAX_DEPTH_X, MAX_DEPTH_Y, depthOffset, type DepthTextures } from './unitDepth';
import { checkerTexture } from './overlayChecker';
import { overlayColorOf, transportOverlayColor, type OverlayId } from './overlayColors';
import type { SpriteRegistry } from './spriteRegistry';
import type { TimeOfDay } from './structurePlan';
import {
  planTransport,
  planUnit,
  type TransportSource,
  type UnitDrawing,
  type UnitSource,
} from './unitPlan';
import type { OpenVenues } from './venueHours';

export interface UnitsInput {
  units: Iterable<UnitSource>;
  transports: Iterable<TransportSource>;
  time: TimeOfDay;
  /** Venue types inside their opening hours; the rest show their closed sprite. */
  openVenues: OpenVenues;
  /** The active overlay; left out, units are drawn normally. */
  overlay?: { id: OverlayId; data: OverlayData };
}

/** The tallest footprint is 4 floors, so a unit can show while its bottom level is just off screen. */
const MAX_FOOTPRINT_FLOORS = 4;

/** A unit being built: a bare site first, then more of the unit behind scaffolding, then the whole unit. */
interface Construction {
  mask: Graphics;
  site: Graphics;
  /** Index of the stage drawn last, so a stage is drawn once. */
  stage: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DrawnUnit {
  sprite: Sprite;
  container: Container;
  textureId: string;
  checker: TilingSprite | null;
  construction: Construction | null;
  /** The box behind the frame sprite, once the unit has depth layers. */
  depth: DepthRoom | null;
}

/**
 * Draws units and transports at their footprint. Each one lives in the
 * container of its bottom level, and later updates change only the sprites
 * whose unit, variant or time of day changed.
 */
export class UnitLayer {
  readonly view = new Container();
  /** Stairs and escalators: one container per level like `view`, but drawn above every unit row. */
  readonly frontView = new Container();
  private readonly rows = new CulledRows<Container>();
  private readonly frontRows = new CulledRows<Container>();
  private readonly containers = new Map<number, Container>();
  private readonly frontContainers = new Map<number, Container>();
  private readonly drawn = new Map<string, DrawnUnit>();
  private readonly rects = new Map<string, WorldRect>();
  private camera: Camera | null = null;

  constructor(private readonly sprites: SpriteRegistry) {}

  update(input: UnitsInput): void {
    const drawings: UnitDrawing[] = [];
    for (const unit of input.units) {
      const color = input.overlay && overlayColorOf(input.overlay.id, unit, input.overlay.data);
      const drawing = planUnit(unit, input.time, color, input.openVenues);
      if (drawing !== null) {
        drawings.push(drawing);
      }
    }
    for (const transport of input.transports) {
      const color = input.overlay && transportOverlayColor(input.overlay.id);
      drawings.push(planTransport(transport, input.time, color));
    }
    this.removeMissing(new Set(drawings.map((drawing) => drawing.id)));
    this.rects.clear();
    for (const drawing of drawings) {
      this.show(drawing);
      this.rects.set(drawing.id, worldRectOf(drawing));
    }
  }

  /** Units still being built. */
  get buildingCount(): number {
    let count = 0;
    for (const entry of this.drawn.values()) {
      if (entry.construction !== null) {
        count += 1;
      }
    }
    return count;
  }

  /** Where a unit or transport is drawn in the world, or undefined when it is not drawn. */
  rectOf(id: string): WorldRect | undefined {
    return this.rects.get(id);
  }

  showOnly(range: LevelRange): void {
    const shown = {
      lowest: range.lowest - MAX_FOOTPRINT_FLOORS + 1,
      highest: range.highest,
    };
    this.rows.showOnly(shown);
    this.frontRows.showOnly(shown);
  }

  get count(): number {
    return this.drawn.size;
  }

  /** Slides the back of every room on screen against its frame, so rooms look like boxes. */
  setCamera(camera: Camera): void {
    this.camera = camera;
    for (const [id, entry] of this.drawn) {
      if (entry.depth !== null && entry.container.visible) {
        this.shiftDepth(entry, this.rects.get(id));
      }
    }
  }

  private shiftDepth(entry: DrawnUnit, rect: WorldRect | undefined): void {
    const camera = this.camera;
    if (entry.depth === null || camera === null || rect === undefined) {
      return;
    }
    const cameraX = (camera.left + camera.viewWidth / 2) / camera.zoom;
    const cameraY = (camera.top + camera.viewHeight / 2) / camera.zoom;
    entry.depth.setShift(
      depthOffset(
        rect.x + rect.width / 2,
        cameraX,
        camera.viewWidth / camera.zoom / 2,
        MAX_DEPTH_X,
      ),
      depthOffset(
        rect.y + rect.height / 2,
        cameraY,
        camera.viewHeight / camera.zoom / 2,
        MAX_DEPTH_Y,
      ),
    );
  }

  /** The layers of a finished room, or null when it has none and is drawn flat. */
  private depthTextures(drawing: UnitDrawing): DepthTextures | null {
    const { variant, subject } = drawing;
    if (
      drawing.construction !== undefined ||
      drawing.overlay !== null ||
      variant.state === undefined ||
      variant.time === undefined
    ) {
      return null;
    }
    const time = variant.time;
    const back = this.sprites.idOf(subject, { state: `back-${variant.state}`, time });
    if (!this.sprites.has(back)) {
      return null;
    }
    const layer = (state: string) => this.sprites.variant(subject, { state, time });
    return {
      back: this.sprites.variant(subject, { state: `back-${variant.state}`, time }),
      front: this.sprites.variant(subject, { state: `front-${variant.state}`, time }),
      side: layer('side'),
      ceiling: layer('ceiling'),
      floor: layer('floor'),
    };
  }

  /** Shows the frame over a box when the room has layers, and the flat picture otherwise. */
  private applyTextures(entry: DrawnUnit, drawing: UnitDrawing): void {
    const layers = this.depthTextures(drawing);
    if (layers === null) {
      entry.sprite.texture = this.sprites.variant(drawing.subject, drawing.variant);
      entry.depth?.destroy();
      entry.depth = null;
      return;
    }
    entry.sprite.texture = layers.front;
    if (entry.depth === null) {
      entry.depth = new DepthRoom(layers, drawing.width, drawing.height);
      entry.container.addChildAt(entry.depth.view, entry.container.getChildIndex(entry.sprite));
    } else {
      entry.depth.setTextures(layers);
    }
    entry.depth.view.position.set(drawing.x, drawing.y);
    const worldY = levelTop(drawing.bottomIndex) + drawing.y + drawing.height / 2;
    entry.depth.setSky(altitudeAtWorldY(worldY), drawing.variant.time ?? 'day');
    this.shiftDepth(entry, this.rects.get(drawing.id) ?? worldRectOf(drawing));
  }

  private removeMissing(keep: ReadonlySet<string>): void {
    for (const [id, entry] of this.drawn) {
      if (!keep.has(id)) {
        this.endConstruction(entry);
        entry.sprite.destroy();
        entry.depth?.destroy();
        entry.checker?.destroy();
        this.drawn.delete(id);
      }
    }
  }

  private show(drawing: UnitDrawing): void {
    const textureId = this.sprites.idOf(drawing.subject, drawing.variant);
    const existing = this.drawn.get(drawing.id);
    if (existing === undefined) {
      this.drawn.set(drawing.id, this.create(drawing, textureId));
      return;
    }
    this.showConstruction(existing, drawing);
    const container = this.containerFor(drawing.bottomIndex, drawing.front === true);
    if (existing.container !== container) {
      container.addChild(existing.sprite);
      existing.container = container;
      if (existing.depth !== null) {
        container.addChildAt(existing.depth.view, container.getChildIndex(existing.sprite));
      }
    }
    this.place(existing.sprite, drawing);
    this.showChecker(existing, drawing);
    const key = this.textureKey(drawing, textureId);
    if (existing.textureId !== key) {
      this.applyTextures(existing, drawing);
      existing.textureId = key;
    }
  }

  private create(drawing: UnitDrawing, textureId: string): DrawnUnit {
    const sprite = new Sprite(this.sprites.variant(drawing.subject, drawing.variant));
    const container = this.containerFor(drawing.bottomIndex, drawing.front === true);
    container.addChild(sprite);
    this.place(sprite, drawing);
    const entry: DrawnUnit = {
      sprite,
      container,
      textureId: this.textureKey(drawing, textureId),
      checker: null,
      construction: null,
      depth: null,
    };
    this.showChecker(entry, drawing);
    this.showConstruction(entry, drawing);
    this.applyTextures(entry, drawing);
    return entry;
  }

  /** A site shows how far the crew has got; once the server sends it as a unit, the site goes away. */
  private showConstruction(entry: DrawnUnit, drawing: UnitDrawing): void {
    if (drawing.construction === undefined) {
      this.endConstruction(entry);
      return;
    }
    if (entry.construction === null) {
      const mask = new Graphics();
      const site = new Graphics();
      entry.container.addChild(mask, site);
      entry.sprite.mask = mask;
      entry.construction = {
        mask,
        site,
        stage: -1,
        x: drawing.x,
        y: drawing.y,
        width: drawing.width,
        height: drawing.height,
      };
    }
    this.growConstruction(entry, entry.construction, drawing.construction);
  }

  private growConstruction(entry: DrawnUnit, build: Construction, percent: number): void {
    const stage = buildStageFor(percent);
    if (stage === null) {
      this.endConstruction(entry);
      return;
    }
    if (stage.index === build.stage) {
      return;
    }
    build.stage = stage.index;
    const shown = Math.round(build.height * stage.built);
    build.mask
      .clear()
      .rect(build.x, build.y + build.height - shown, build.width, shown)
      .fill(0xffffff);
    build.site.clear();
    for (const rect of siteRects(stage, build)) {
      build.site.rect(rect.x, rect.y, rect.w, rect.h).fill(rect.color);
    }
  }

  private endConstruction(entry: DrawnUnit): void {
    const build = entry.construction;
    if (build === null) {
      return;
    }
    entry.sprite.mask = null;
    build.mask.destroy();
    build.site.destroy();
    entry.construction = null;
  }

  /** The checker sits right above its sprite, so it is culled with it. */
  private showChecker(entry: DrawnUnit, drawing: UnitDrawing): void {
    if (drawing.overlay === null) {
      entry.checker?.destroy();
      entry.checker = null;
      return;
    }
    if (entry.checker === null) {
      entry.checker = new TilingSprite({ texture: checkerTexture(drawing.overlay) });
    }
    const checker = entry.checker;
    checker.texture = checkerTexture(drawing.overlay);
    checker.position.set(drawing.x, drawing.y);
    checker.width = drawing.width;
    checker.height = drawing.height;
    entry.container.addChild(checker);
    entry.container.setChildIndex(checker, entry.container.children.length - 1);
  }

  /** Changes when the picture or its depth layers do, so textures are swapped only then. */
  private textureKey(drawing: UnitDrawing, textureId: string): string {
    return `${textureId}|${this.depthTextures(drawing) === null ? 'flat' : 'depth'}|${drawing.x},${drawing.y}`;
  }

  /** Placeholders are one tile big, so every sprite is sized to the footprint. */
  private place(sprite: Sprite, drawing: UnitDrawing): void {
    sprite.position.set(drawing.x, drawing.y);
    sprite.width = drawing.width;
    sprite.height = drawing.height;
  }

  private containerFor(index: number, front: boolean): Container {
    const containers = front ? this.frontContainers : this.containers;
    const existing = containers.get(index);
    if (existing !== undefined) {
      return existing;
    }
    const container = new Container();
    container.y = levelTop(index);
    containers.set(index, container);
    (front ? this.frontRows : this.rows).set(index, container);
    (front ? this.frontView : this.view).addChild(container);
    return container;
  }
}

function worldRectOf(drawing: UnitDrawing): WorldRect {
  return {
    x: drawing.x,
    y: levelTop(drawing.bottomIndex) + drawing.y,
    width: drawing.width,
    height: drawing.height,
  };
}
