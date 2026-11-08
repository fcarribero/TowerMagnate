import type { Level } from '@tower-magnate/shared';
import { Application, Container, TextureSource, type TilingSprite } from 'pixi.js';
import { loadSprites } from './atlasLoader';
import {
  centerCamera,
  createCamera,
  nextZoom,
  resizeCamera,
  visibleLevels,
  zoomCamera,
  type Camera,
} from './camera';
import { attachCameraInput, type CameraChange } from './cameraInput';
import { canvasSizeFromCssPixels, canvasSizeFromObservedBox, type CanvasSize } from './canvasSize';
import { CulledRows } from './culledRows';
import { levelAtCanvasY } from './levelRuler';
import { levelTop } from './levels';
import type { Zoom } from './metrics';
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

export type CameraListener = (camera: Camera) => void;
export type HoverLevelListener = (level: Level | null) => void;

export interface Stage {
  sprites: SpriteRegistry;
  camera(): Camera;
  /** Puts a world point (zoom 1 pixels) at the centre of the view. */
  centerOn(worldX: number, worldY: number): void;
  /** One zoom level in or out, keeping the centre of the view in place. */
  zoomStep(direction: 1 | -1): void;
  onCameraChange(listener: CameraListener): () => void;
  /** Called with the level under the pointer, or null when the pointer leaves the tower. */
  onHoverLevel(listener: HoverLevelListener): () => void;
  /** CSS pixels per canvas device pixel, to place DOM overlays over the canvas. */
  cssPerDevicePixel(): number;
  /** Draws the tower structure; later calls redraw only the levels that changed. */
  showStructure(input: StructureInput): void;
  /** Draws units and transports; later calls change only what differs. */
  showUnits(input: UnitsInput): void;
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
  world.addChild(units.view);
  app.stage.addChild(world);

  const firstSize = measureHost(host);
  let camera = createCamera(firstSize.deviceWidth, firstSize.deviceHeight, DEFAULT_ZOOM);
  const cameraListeners = new Set<CameraListener>();
  const hoverListeners = new Set<HoverLevelListener>();
  let hoveredLevel: Level | null = null;
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

  const showCamera = (): void => {
    world.scale.set(camera.zoom);
    world.position.set(-camera.left, -camera.top);
    const onScreen = visibleLevels(camera);
    sky.showOnly(onScreen);
    structure.rows.showOnly(onScreen);
    units.showOnly(onScreen);
    for (const listener of cameraListeners) {
      listener(camera);
    }
    updateHoveredLevel();
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
  );
  const onPointerMove = (event: PointerEvent): void => {
    pointerCanvasY = event.offsetY / cssPerDevicePixel();
    updateHoveredLevel();
  };
  const onPointerLeave = (): void => {
    pointerCanvasY = null;
    updateHoveredLevel();
  };
  app.canvas.addEventListener('pointermove', onPointerMove);
  app.canvas.addEventListener('pointerleave', onPointerLeave);
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
    cssPerDevicePixel,
    showStructure(input) {
      structure.update(input);
    },
    showUnits(input) {
      units.update(input);
    },
    destroy() {
      cameraListeners.clear();
      hoverListeners.clear();
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
