import type { OverlayData } from '@tower-magnate/shared';
import { Container, Sprite, TilingSprite } from 'pixi.js';
import { CulledRows } from './culledRows';
import type { LevelRange, WorldRect } from './camera';
import { levelTop } from './levels';
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

interface DrawnUnit {
  sprite: Sprite;
  container: Container;
  textureId: string;
  checker: TilingSprite | null;
}

/**
 * Draws units and transports at their footprint. Each one lives in the
 * container of its bottom level, and later updates change only the sprites
 * whose unit, variant or time of day changed.
 */
export class UnitLayer {
  readonly view = new Container();
  private readonly rows = new CulledRows<Container>();
  private readonly containers = new Map<number, Container>();
  private readonly drawn = new Map<string, DrawnUnit>();
  private readonly rects = new Map<string, WorldRect>();

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

  /** Where a unit or transport is drawn in the world, or undefined when it is not drawn. */
  rectOf(id: string): WorldRect | undefined {
    return this.rects.get(id);
  }

  showOnly(range: LevelRange): void {
    this.rows.showOnly({
      lowest: range.lowest - MAX_FOOTPRINT_FLOORS + 1,
      highest: range.highest,
    });
  }

  get count(): number {
    return this.drawn.size;
  }

  private removeMissing(keep: ReadonlySet<string>): void {
    for (const [id, entry] of this.drawn) {
      if (!keep.has(id)) {
        entry.sprite.destroy();
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
    const container = this.containerFor(drawing.bottomIndex);
    if (existing.container !== container) {
      container.addChild(existing.sprite);
      existing.container = container;
    }
    this.place(existing.sprite, drawing);
    this.showChecker(existing, drawing);
    if (existing.textureId !== textureId) {
      existing.sprite.texture = this.sprites.variant(drawing.subject, drawing.variant);
      existing.textureId = textureId;
    }
  }

  private create(drawing: UnitDrawing, textureId: string): DrawnUnit {
    const sprite = new Sprite(this.sprites.variant(drawing.subject, drawing.variant));
    const container = this.containerFor(drawing.bottomIndex);
    container.addChild(sprite);
    this.place(sprite, drawing);
    const entry: DrawnUnit = { sprite, container, textureId, checker: null };
    this.showChecker(entry, drawing);
    return entry;
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

  /** Placeholders are one tile big, so every sprite is sized to the footprint. */
  private place(sprite: Sprite, drawing: UnitDrawing): void {
    sprite.position.set(drawing.x, drawing.y);
    sprite.width = drawing.width;
    sprite.height = drawing.height;
  }

  private containerFor(index: number): Container {
    const existing = this.containers.get(index);
    if (existing !== undefined) {
      return existing;
    }
    const container = new Container();
    container.y = levelTop(index);
    this.containers.set(index, container);
    this.rows.set(index, container);
    this.view.addChild(container);
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
