import type { Level, ShaftView } from '@tower-magnate/shared';
import { Application, Container, TextureSource, type TilingSprite } from 'pixi.js';
import type { DrawnFrame } from '../model/interpolation';
import 'pixi.js/unsafe-eval';
import { loadSprites } from './atlasLoader';
import {
  centerCamera,
  centerCameraOnRect,
  screenRectOf,
  type ScreenRect,
  createCamera,
  nextZoom,
  resizeCamera,
  visibleLevels,
  zoomCamera,
  type Camera,
} from './camera';
import { attachCameraInput, type CameraChange } from './cameraInput';
import { canvasSizeFromCssPixels, canvasSizeFromObservedBox, type CanvasSize } from './canvasSize';
import { cellAtCanvasPoint, type Cell } from './cellAtPoint';
import { CulledRows } from './culledRows';
import { GhostLayer, type Footprint, type GhostInput, type RunInput } from './ghostLayer';
import { levelAtCanvasY } from './levelRuler';
import { levelTop } from './levels';
import type { Zoom } from './metrics';
import { ElevatorLayer } from './elevatorLayer';
import { PeopleLayer } from './peopleLayer';
import { createSkyRows } from './skyRows';
import type { SpriteRegistry } from './spriteRegistry';
import { StructureLayer } from './structureLayer';
import type { StructureInput } from './structureRows';
import { UnitLayer, type UnitsInput } from './unitLayer';

const SKY_COLOR = '#6f9fd8';
const DEFAULT_ZOOM: Zoom = 2;
const STATS_INTERVAL_MS = 500;

export interface RenderStats {
  fps: number;
  zoom: Zoom;
  floorsDrawn: number;
}

export interface StageOptions {
  onStats?: (stats: RenderStats) => void;
}

export type CarSource = () => { frame: DrawnFrame; shafts: ReadonlyMap<string, ShaftView> } | null;
export type CameraListener = (camera: Camera) => void;
export type HoverLevelListener = (level: Level | null) => void;
export type HoverCellListener = (cell: Cell | null) => void;

/** A primary-button press or release on the tower, or a right click. `cell` is null off the tower. */
export interface CellInput {
  kind: 'down' | 'up' | 'cancel';
  cell: Cell | null;
  clientX: number;
  clientY: number;
}
export type CellInputListener = (input: CellInput) => void;

export interface Stage {
  sprites: SpriteRegistry;
  camera(): Camera;
  /** Puts a world point (zoom 1 pixels) at the centre of the view. */
  centerOn(worldX: number, worldY: number): void;
  /** Moves the view to a drawn unit at the current zoom; false when the unit is not drawn. */
  centerOnUnit(unitId: string): boolean;
  /** The unit's rectangle in canvas device pixels, or null when it is off screen or not drawn. */
  unitScreenRect(unitId: string): ScreenRect | null;
  /** One zoom level in or out, keeping the centre of the view in place. */
  zoomStep(direction: 1 | -1): void;
  onCameraChange(listener: CameraListener): () => void;
  /** Called with the level under the pointer, or null when the pointer leaves the tower. */
  onHoverLevel(listener: HoverLevelListener): () => void;
  /** Called with the tile under the pointer, or null when the pointer leaves the tower. */
  onHoverCell(listener: HoverCellListener): () => void;
  /** Called for presses, releases and right clicks, for tools that build by clicking or dragging. */
  onCellInput(listener: CellInputListener): () => void;
  /** When false, dragging with the primary button no longer scrolls the view. */
  setPrimaryDragPans(pans: boolean): void;
  /** Draws a filled run of tiles, such as a floor being dragged out; null removes it. */
  showRun(run: RunInput | null): void;
  /** Draws the placement ghost, snapped to tiles; null removes it. */
  showGhost(ghost: GhostInput | null): void;
  /** Frames a footprint, such as the unit under the pointer; null removes the frame. */
  showHighlight(highlight: Footprint | null, color?: number): void;
  /** CSS pixels per canvas device pixel, to place DOM overlays over the canvas. */
  cssPerDevicePixel(): number;
  /** Draws the tower structure; later calls redraw only the levels that changed. */
  showStructure(input: StructureInput): void;
  /** Draws units and transports; later calls change only what differs. */
  showUnits(input: UnitsInput): void;
  /** Draws elevator shafts; later calls change only the shafts that differ. */
  showShafts(shafts: Iterable<ShaftView>): void;
  /**
   * Asks `source` for the cars and riders to draw on every frame. It returns
   * null while there is nothing to draw, and `shafts` says where each car runs.
   */
  feedCars(source: CarSource | null): void;
  destroy(): void;
}

export async function mountStage(host: HTMLElement, options: StageOptions = {}): Promise<Stage> {
  TextureSource.defaultOptions.scaleMode = 'nearest';
  const sprites = await loadSprites();

  const app = new Application();
  await app.init({
    background: SKY_COLOR,
    antialias: false,
    resolution: 1,
    autoDensity: false,
    roundPixels: true,
    width: 1,
    height: 1,
  });
  host.appendChild(app.canvas);
  app.canvas.style.touchAction = 'none';

  const world = new Container();
  const sky = new CulledRows<TilingSprite>();
  for (const [index, row] of createSkyRows(sprites)) {
    row.y = levelTop(index);
    sky.set(index, row);
    world.addChild(row);
  }
  const structure = new StructureLayer(sprites);
  world.addChild(structure.view);
  const units = new UnitLayer(sprites);
  const elevators = new ElevatorLayer(sprites);
  world.addChild(elevators.shaftView);
  world.addChild(units.view);
  world.addChild(elevators.carView);
  const people = new PeopleLayer(sprites);
  world.addChild(people.view);
  const ghost = new GhostLayer(sprites);
  world.addChild(ghost.view);
  app.stage.addChild(world);

  const firstSize = measureHost(host);
  let camera = createCamera(firstSize.deviceWidth, firstSize.deviceHeight, DEFAULT_ZOOM);
  const cameraListeners = new Set<CameraListener>();
  const hoverListeners = new Set<HoverLevelListener>();
  let hoveredLevel: Level | null = null;
  const hoverCellListeners = new Set<HoverCellListener>();
  let hoveredCell: Cell | null = null;
  const cellInputListeners = new Set<CellInputListener>();
  let primaryDragPans = true;
  let pointerCanvasX: number | null = null;
  let pointerCanvasY: number | null = null;

  const cssPerDevicePixel = (): number =>
    app.renderer.height === 0 ? 1 : app.canvas.clientHeight / app.renderer.height;

  const updateHoveredLevel = (): void => {
    const level = pointerCanvasY === null ? null : levelAtCanvasY(camera, pointerCanvasY);
    if (level === hoveredLevel) {
      return;
    }
    hoveredLevel = level;
    for (const listener of hoverListeners) {
      listener(level);
    }
  };

  const updateHoveredCell = (): void => {
    const cell =
      pointerCanvasX === null || pointerCanvasY === null
        ? null
        : cellAtCanvasPoint(camera, pointerCanvasX, pointerCanvasY);
    if (cell?.x === hoveredCell?.x && cell?.level === hoveredCell?.level) {
      return;
    }
    hoveredCell = cell;
    for (const listener of hoverCellListeners) {
      listener(cell);
    }
  };

  const showCamera = (): void => {
    world.scale.set(camera.zoom);
    ghost.setZoom(camera.zoom);
    world.position.set(-camera.left, -camera.top);
    const onScreen = visibleLevels(camera);
    sky.showOnly(onScreen);
    structure.rows.showOnly(onScreen);
    units.showOnly(onScreen);
    elevators.showOnly(onScreen);
    people.showOnly(onScreen);
    for (const listener of cameraListeners) {
      listener(camera);
    }
    updateHoveredLevel();
    updateHoveredCell();
  };

  const applySize = (size: CanvasSize): void => {
    app.renderer.resize(size.deviceWidth, size.deviceHeight);
    app.canvas.style.width = `${size.cssWidth}px`;
    app.canvas.style.height = `${size.cssHeight}px`;
    camera = resizeCamera(camera, size.deviceWidth, size.deviceHeight);
    showCamera();
  };

  applySize(firstSize);
  const observer = observeDeviceSize(host, applySize);
  const detachInput = attachCameraInput(
    app.canvas,
    () => camera,
    (change: CameraChange) => {
      camera = change(camera);
      showCamera();
    },
    () => primaryDragPans,
  );
  const emitCellInput = (kind: CellInput['kind'], event: MouseEvent): void => {
    const canvasRect = app.canvas.getBoundingClientRect();
    const scale = cssPerDevicePixel();
    const cell = cellAtCanvasPoint(
      camera,
      (event.clientX - canvasRect.left) / scale,
      (event.clientY - canvasRect.top) / scale,
    );
    for (const listener of cellInputListeners) {
      listener({ kind, cell, clientX: event.clientX, clientY: event.clientY });
    }
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button === 0) {
      emitCellInput('down', event);
    }
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (event.button === 0) {
      emitCellInput('up', event);
    }
  };
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    emitCellInput('cancel', event);
  };
  const onPointerMove = (event: PointerEvent): void => {
    pointerCanvasX = event.offsetX / cssPerDevicePixel();
    pointerCanvasY = event.offsetY / cssPerDevicePixel();
    updateHoveredLevel();
    updateHoveredCell();
  };
  const onPointerLeave = (): void => {
    pointerCanvasX = null;
    pointerCanvasY = null;
    updateHoveredLevel();
    updateHoveredCell();
  };
  app.canvas.addEventListener('pointermove', onPointerMove);
  app.canvas.addEventListener('pointerleave', onPointerLeave);
  app.canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  app.canvas.addEventListener('contextmenu', onContextMenu);
  let carSource: CarSource | null = null;
  const drawCars = (): void => {
    const next = carSource?.();
    if (next) {
      elevators.showCars(next.frame, next.shafts);
      people.show(next.frame);
    }
  };
  app.ticker.add(drawCars);
  const statsTimer = window.setInterval(() => {
    options.onStats?.({
      fps: Math.round(app.ticker.FPS),
      zoom: camera.zoom,
      floorsDrawn: structure.rows.drawnCount,
    });
  }, STATS_INTERVAL_MS);

  return {
    sprites,
    camera: () => camera,
    centerOn(worldX, worldY) {
      camera = centerCamera(camera, worldX, worldY);
      showCamera();
    },
    centerOnUnit(unitId) {
      const rect = units.rectOf(unitId);
      if (rect === undefined) {
        return false;
      }
      camera = centerCameraOnRect(camera, rect);
      showCamera();
      return true;
    },
    unitScreenRect(unitId) {
      const rect = units.rectOf(unitId);
      return rect === undefined ? null : screenRectOf(camera, rect);
    },
    zoomStep(direction) {
      const zoom = nextZoom(camera.zoom, direction);
      camera = zoomCamera(camera, zoom, camera.viewWidth / 2, camera.viewHeight / 2);
      showCamera();
    },
    onCameraChange(listener) {
      cameraListeners.add(listener);
      return () => cameraListeners.delete(listener);
    },
    onHoverLevel(listener) {
      hoverListeners.add(listener);
      return () => hoverListeners.delete(listener);
    },
    onHoverCell(listener) {
      hoverCellListeners.add(listener);
      return () => hoverCellListeners.delete(listener);
    },
    onCellInput(listener) {
      cellInputListeners.add(listener);
      return () => cellInputListeners.delete(listener);
    },
    setPrimaryDragPans(pans) {
      primaryDragPans = pans;
    },
    showRun(input) {
      ghost.showRun(input);
    },
    showGhost(input) {
      ghost.showGhost(input);
    },
    showHighlight(input, color) {
      ghost.showHighlight(input, color);
    },
    cssPerDevicePixel,
    showStructure(input) {
      structure.update(input);
    },
    showUnits(input) {
      units.update(input);
    },
    showShafts(shafts) {
      elevators.showShafts(shafts);
    },
    feedCars(source) {
      carSource = source;
    },
    destroy() {
      app.ticker.remove(drawCars);
      cameraListeners.clear();
      hoverListeners.clear();
      hoverCellListeners.clear();
      cellInputListeners.clear();
      app.canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      app.canvas.removeEventListener('contextmenu', onContextMenu);
      app.canvas.removeEventListener('pointermove', onPointerMove);
      app.canvas.removeEventListener('pointerleave', onPointerLeave);
      window.clearInterval(statsTimer);
      detachInput();
      observer.disconnect();
      app.destroy({ removeView: true }, { children: true });
    },
  };
}

function measureHost(host: HTMLElement): CanvasSize {
  return canvasSizeFromCssPixels(host.clientWidth, host.clientHeight, window.devicePixelRatio);
}

function observeDeviceSize(
  host: HTMLElement,
  onResize: (size: CanvasSize) => void,
): ResizeObserver {
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry === undefined) {
      return;
    }
    const cssBox = entry.contentBoxSize[0];
    if (cssBox === undefined) {
      onResize(measureHost(host));
      return;
    }
    const deviceBox = entry.devicePixelContentBoxSize?.[0];
    onResize(
      canvasSizeFromObservedBox(
        { width: cssBox.inlineSize, height: cssBox.blockSize },
        deviceBox && { width: deviceBox.inlineSize, height: deviceBox.blockSize },
        window.devicePixelRatio,
      ),
    );
  });

  try {
    observer.observe(host, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(host);
  }
  return observer;
}
