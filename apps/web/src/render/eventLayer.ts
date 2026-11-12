import { Container, Sprite } from 'pixi.js';
import type { LevelRange } from './camera';
import { CulledRows } from './culledRows';
import {
  frameAt,
  planBlast,
  planHelicopter,
  planSanta,
  waterTargetOf,
  type EffectDrawing,
  type SpritePlacement,
  type TransientEffect,
  type WaterTarget,
} from './eventPlan';
import { levelToIndex, levelTop } from './levels';
import type { SpriteRegistry } from './spriteRegistry';
import type { FireSpan } from '@tower-magnate/shared';

/** A running one-off effect and the world it needs to place itself. */
interface Running {
  effect: TransientEffect;
  startedAtMs: number;
  water: WaterTarget | null;
}

interface DrawnLooping {
  sprite: Sprite;
  drawing: EffectDrawing;
}

/**
 * Draws what the active events put in the tower: flames, roaches and the
 * wedding bell stay while the event does, and a blast, the helicopter and
 * Papa Noel play once from the moment their event arrives.
 */
export class EventLayer {
  readonly view = new Container();
  private readonly rows = new CulledRows<Container>();
  private readonly containers = new Map<number, Container>();
  private readonly sky = new Container();
  private readonly looping = new Map<string, DrawnLooping>();
  private readonly transientSprites = new Map<string, Sprite>();
  private running: Running[] = [];
  private lastFire: readonly FireSpan[] = [];
  private towerTopLevel = 1;

  constructor(private readonly sprites: SpriteRegistry) {
    this.view.addChild(this.sky);
  }

  get count(): number {
    return this.looping.size + this.transientSprites.size;
  }

  /** The highest built level, where the sky effects fly above. */
  setTowerTop(level: number): void {
    this.towerTopLevel = level;
  }

  /** Shows exactly these looping drawings; the ones no longer listed are removed. */
  showLooping(drawings: readonly EffectDrawing[], fire: readonly FireSpan[]): void {
    this.lastFire = fire.length > 0 ? fire : this.lastFire;
    const keep = new Set(drawings.map((drawing) => drawing.key));
    for (const [key, entry] of this.looping) {
      if (!keep.has(key)) {
        entry.sprite.destroy();
        this.looping.delete(key);
      }
    }
    for (const drawing of drawings) {
      const existing = this.looping.get(drawing.key);
      if (existing === undefined) {
        this.looping.set(drawing.key, this.createLooping(drawing));
      } else {
        existing.drawing = drawing;
      }
    }
  }

  start(effect: TransientEffect, nowMs: number): void {
    const water = effect.kind === 'helicopter' ? waterTargetOf(this.lastFire) : null;
    this.running.push({ effect, startedAtMs: nowMs, water });
  }

  tick(nowMs: number): void {
    for (const entry of this.looping.values()) {
      entry.sprite.texture = this.sprites.texture(frameAt(entry.drawing, nowMs));
    }
    this.drawTransients(nowMs);
  }

  showOnly(range: LevelRange): void {
    this.rows.showOnly(range);
  }

  private drawTransients(nowMs: number): void {
    const placements: SpritePlacement[] = [];
    const stillRunning: Running[] = [];
    for (const run of this.running) {
      const elapsed = nowMs - run.startedAtMs;
      const drawn = this.placementsOf(run, elapsed);
      if (drawn.length > 0 || elapsed < 0) {
        placements.push(...drawn);
        stillRunning.push(run);
      }
    }
    this.running = stillRunning;
    this.showPlacements(placements);
  }

  private placementsOf(run: Running, elapsed: number): SpritePlacement[] {
    switch (run.effect.kind) {
      case 'blast':
        return planBlast(run.effect.cells, elapsed);
      case 'helicopter':
        return planHelicopter(elapsed, run.water, this.towerTopLevel);
      case 'santa':
        return planSanta(elapsed, this.towerTopLevel);
    }
  }

  private showPlacements(placements: readonly SpritePlacement[]): void {
    const keep = new Set(placements.map((placement) => placement.key));
    for (const [key, sprite] of this.transientSprites) {
      if (!keep.has(key)) {
        sprite.destroy();
        this.transientSprites.delete(key);
      }
    }
    for (const placement of placements) {
      const sprite = this.transientSprites.get(placement.key) ?? this.createTransient(placement);
      sprite.texture = this.sprites.texture(placement.sprite);
      sprite.position.set(placement.x, placement.y);
    }
  }

  private createTransient(placement: SpritePlacement): Sprite {
    const sprite = new Sprite();
    const parent = placement.level === null ? this.sky : this.containerFor(placement.level);
    parent.addChild(sprite);
    this.transientSprites.set(placement.key, sprite);
    return sprite;
  }

  private createLooping(drawing: EffectDrawing): DrawnLooping {
    const sprite = new Sprite(this.sprites.texture(frameAt(drawing, 0)));
    sprite.position.set(drawing.x, drawing.y);
    this.containerFor(drawing.level).addChild(sprite);
    return { sprite, drawing };
  }

  private containerFor(level: number): Container {
    const index = levelToIndex(level);
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
