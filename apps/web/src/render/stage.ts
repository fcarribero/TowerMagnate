import { Application, Container, TextureSource } from 'pixi.js';
import { centerCamera, createCamera, resizeCamera, visibleLevels, type Camera } from './camera';
import { attachCameraInput, type CameraChange } from './cameraInput';
import { canvasSizeFromCssPixels, canvasSizeFromObservedBox, type CanvasSize } from './canvasSize';
import { CulledRows } from './culledRows';
import { levelTop } from './levels';
import type { Zoom } from './metrics';
import { createPlaceholderTower } from './placeholderTower';

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

export interface Stage {
  camera(): Camera;
  /** Puts a world point (zoom 1 pixels) at the centre of the view. */
  centerOn(worldX: number, worldY: number): void;
  onCameraChange(listener: CameraListener): () => void;
  destroy(): void;
}

export async function mountStage(host: HTMLElement, options: StageOptions = {}): Promise<Stage> {
  TextureSource.defaultOptions.scaleMode = 'nearest';

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
  const floors = new CulledRows<Container>();
  for (const [index, floor] of createPlaceholderTower()) {
    floor.y = levelTop(index);
    floors.set(index, floor);
    world.addChild(floor);
  }
  app.stage.addChild(world);

  const firstSize = measureHost(host);
  let camera = createCamera(firstSize.deviceWidth, firstSize.deviceHeight, DEFAULT_ZOOM);
  const cameraListeners = new Set<CameraListener>();

  const showCamera = (): void => {
    world.scale.set(camera.zoom);
    world.position.set(-camera.left, -camera.top);
    floors.showOnly(visibleLevels(camera));
    for (const listener of cameraListeners) {
      listener(camera);
    }
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
  const statsTimer = window.setInterval(() => {
    options.onStats?.({
      fps: Math.round(app.ticker.FPS),
      zoom: camera.zoom,
      floorsDrawn: floors.drawnCount,
    });
  }, STATS_INTERVAL_MS);

  return {
    camera: () => camera,
    centerOn(worldX, worldY) {
      camera = centerCamera(camera, worldX, worldY);
      showCamera();
    },
    onCameraChange(listener) {
      cameraListeners.add(listener);
      return () => cameraListeners.delete(listener);
    },
    destroy() {
      cameraListeners.clear();
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
